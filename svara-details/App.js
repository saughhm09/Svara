import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  Modal,
  Alert,
} from 'react-native';
import { Audio } from 'expo-av';
import Slider from '@react-native-community/slider';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Scale factor based on original 800x600 canvas
const SCALE_X = SCREEN_WIDTH / 800;
const SCALE_Y = SCREEN_HEIGHT / 600;
const SCALE = Math.min(SCALE_X, SCALE_Y);

// Game configuration (scaled from original)
const CONFIG = {
  orbRadius: 12 * SCALE,
  orbX: 150 * SCALE,
  pipeWidth: 60 * SCALE,
  initialPipeGap: 250 * SCALE,
  pipeSpeed: 2 * SCALE,
  pipeSpacing: 300 * SCALE,
  maxVelocity: 2.5 * SCALE,
};

// Pipe speed levels
const PIPE_SPEED_LEVELS = {
  'very-easy': 0.5,
  'easy': 1.0,
  'medium': 1.5,
  'hard': 2.5,
  'very-hard': 4.0,
};

export default function App() {
  // Game state
  const [gameState, setGameState] = useState('start'); // 'start', 'waiting', 'playing', 'gameOver'
  const [score, setScore] = useState(0);
  const [orbY, setOrbY] = useState(SCREEN_HEIGHT / 2);
  const [orbVelocity, setOrbVelocity] = useState(0);
  const [pipes, setPipes] = useState([]);
  const [currentVolume, setCurrentVolume] = useState(0);
  
  // Settings
  const [sensitivity, setSensitivity] = useState(5);
  const [volumeThreshold, setVolumeThreshold] = useState(3);
  const [gravityStrength, setGravityStrength] = useState(0);
  const [pipeSpeedLevel, setPipeSpeedLevel] = useState('easy');
  const [showSettings, setShowSettings] = useState(false);
  
  // Refs
  const gameLoopRef = useRef(null);
  const recordingRef = useRef(null);
  const actualGameStartTime = useRef(0);
  
  // Initialize audio recording
  const startAudioRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission Required', 'Microphone access is required to play SVARA!');
        return false;
      }
      
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        android: {
          extension: '.m4a',
          outputFormat: Audio.RECORDING_OPTION_ANDROID_OUTPUT_FORMAT_MPEG_4,
          audioEncoder: Audio.RECORDING_OPTION_ANDROID_AUDIO_ENCODER_AAC,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: '.m4a',
          audioQuality: Audio.RECORDING_OPTION_IOS_AUDIO_QUALITY_HIGH,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        isMeteringEnabled: true,
      });
      
      await recording.startAsync();
      recordingRef.current = recording;
      
      return true;
    } catch (error) {
      console.error('Error starting audio:', error);
      Alert.alert('Error', 'Failed to access microphone');
      return false;
    }
  };
  
  // Stop audio recording
  const stopAudioRecording = async () => {
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
        recordingRef.current = null;
      } catch (error) {
        console.error('Error stopping audio:', error);
      }
    }
  };
  
  // Get current audio level
  const getAudioLevel = async () => {
    if (recordingRef.current) {
      try {
        const status = await recordingRef.current.getStatusAsync();
        if (status.metering !== undefined) {
          // Convert dB to 0-1 range (metering is typically -160 to 0 dB)
          const db = status.metering;
          const normalized = Math.max(0, Math.min(1, (db + 60) / 60));
          return normalized;
        }
      } catch (error) {
        console.error('Error getting audio level:', error);
      }
    }
    return 0;
  };
  
  // Initialize pipes
  const initPipes = () => {
    const newPipes = [];
    for (let i = 0; i < 3; i++) {
      newPipes.push(createPipe(SCREEN_WIDTH + i * CONFIG.pipeSpacing));
    }
    return newPipes;
  };
  
  // Create a new pipe
  const createPipe = (x) => {
    const gapY = 100 * SCALE + Math.random() * (SCREEN_HEIGHT - 200 * SCALE - CONFIG.initialPipeGap);
    return {
      x,
      topHeight: gapY,
      bottomY: gapY + CONFIG.initialPipeGap,
      passed: false,
    };
  };
  
  // Check collision
  const checkCollision = (y, pipeList) => {
    const orbLeft = CONFIG.orbX - CONFIG.orbRadius;
    const orbRight = CONFIG.orbX + CONFIG.orbRadius;
    const orbTop = y - CONFIG.orbRadius;
    const orbBottom = y + CONFIG.orbRadius;
    
    for (const pipe of pipeList) {
      const pipeLeft = pipe.x;
      const pipeRight = pipe.x + CONFIG.pipeWidth;
      
      if (orbRight > pipeLeft && orbLeft < pipeRight) {
        if (orbTop < pipe.topHeight || orbBottom > pipe.bottomY) {
          return true;
        }
      }
    }
    
    // Check boundaries
    if (orbTop <= 0 || orbBottom >= SCREEN_HEIGHT) {
      return true;
    }
    
    return false;
  };
  
  // Start game
  const startGame = async () => {
    const audioStarted = await startAudioRecording();
    if (!audioStarted) return;
    
    setGameState('waiting');
    setScore(0);
    setOrbY(SCREEN_HEIGHT / 2);
    setOrbVelocity(0);
    setPipes(initPipes());
    actualGameStartTime.current = 0;
  };
  
  // Game over
  const gameOver = async () => {
    setGameState('gameOver');
    await stopAudioRecording();
    if (gameLoopRef.current) {
      cancelAnimationFrame(gameLoopRef.current);
    }
  };
  
  // Game loop
  useEffect(() => {
    if (gameState !== 'waiting' && gameState !== 'playing') return;
    
    let lastTime = Date.now();
    
    const update = async () => {
      const now = Date.now();
      const delta = (now - lastTime) / 16.67; // Normalize to ~60fps
      lastTime = now;
      
      // Get audio level
      const volume = await getAudioLevel();
      setCurrentVolume(volume);
      
      const threshold = volumeThreshold / 10;
      
      if (gameState === 'waiting') {
        if (volume > threshold) {
          setGameState('playing');
          actualGameStartTime.current = Date.now();
        }
        gameLoopRef.current = requestAnimationFrame(update);
        return;
      }
      
      // Calculate gravity
      const gravitySliderValue = gravityStrength;
      const currentGravity = (0.01 + ((gravitySliderValue + 7) * 0.02)) * SCALE;
      
      // Determine pipe speed
      const timeElapsed = (Date.now() - actualGameStartTime.current) / 1000;
      const currentPipeSpeed = timeElapsed < 1 ? 'easy' : pipeSpeedLevel;
      const pipeSpeedMultiplier = PIPE_SPEED_LEVELS[currentPipeSpeed];
      
      // Update orb physics
      let newVelocity = orbVelocity;
      newVelocity += currentGravity * delta;
      
      if (volume > threshold) {
        const currentSensitivity = sensitivity / 25;
        const upwardForce = currentSensitivity * 2 * SCALE;
        newVelocity -= upwardForce * delta;
      }
      
      // Limit velocity
      const maxVel = CONFIG.maxVelocity + ((gravitySliderValue + 7) * 0.15 * SCALE);
      newVelocity = Math.max(-maxVel, Math.min(maxVel, newVelocity));
      
      const newOrbY = orbY + newVelocity * delta;
      
      // Update pipes
      const newPipes = pipes.map(pipe => ({
        ...pipe,
        x: pipe.x - CONFIG.pipeSpeed * pipeSpeedMultiplier * delta,
      }));
      
      // Check for passed pipes and scoring
      let newScore = score;
      newPipes.forEach(pipe => {
        if (!pipe.passed && pipe.x + CONFIG.pipeWidth < CONFIG.orbX) {
          pipe.passed = true;
          newScore++;
        }
      });
      
      // Remove off-screen pipes and add new ones
      const filteredPipes = newPipes.filter(pipe => pipe.x + CONFIG.pipeWidth > 0);
      if (filteredPipes.length > 0) {
        const lastPipe = filteredPipes[filteredPipes.length - 1];
        if (lastPipe.x < SCREEN_WIDTH - CONFIG.pipeSpacing) {
          filteredPipes.push(createPipe(SCREEN_WIDTH));
        }
      }
      
      // Check collision
      if (checkCollision(newOrbY, filteredPipes)) {
        gameOver();
        return;
      }
      
      // Update state
      setOrbVelocity(newVelocity);
      setOrbY(newOrbY);
      setPipes(filteredPipes);
      setScore(newScore);
      
      gameLoopRef.current = requestAnimationFrame(update);
    };
    
    gameLoopRef.current = requestAnimationFrame(update);
    
    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, [gameState, orbY, orbVelocity, pipes, score, sensitivity, volumeThreshold, gravityStrength, pipeSpeedLevel]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAudioRecording();
    };
  }, []);
  
  // Render game
  return (
    <View style={styles.container}>
      {/* Game Canvas */}
      <View style={styles.gameArea}>
        {/* Pipes */}
        {pipes.map((pipe, index) => (
          <React.Fragment key={index}>
            {/* Top pipe */}
            <View
              style={[
                styles.pipe,
                {
                  left: pipe.x,
                  top: 0,
                  width: CONFIG.pipeWidth,
                  height: pipe.topHeight,
                },
              ]}
            />
            {/* Bottom pipe */}
            <View
              style={[
                styles.pipe,
                {
                  left: pipe.x,
                  top: pipe.bottomY,
                  width: CONFIG.pipeWidth,
                  height: SCREEN_HEIGHT - pipe.bottomY,
                },
              ]}
            />
          </React.Fragment>
        ))}
        
        {/* Orb */}
        <View
          style={[
            styles.orb,
            {
              left: CONFIG.orbX - CONFIG.orbRadius,
              top: orbY - CONFIG.orbRadius,
              width: CONFIG.orbRadius * 2,
              height: CONFIG.orbRadius * 2,
              borderRadius: CONFIG.orbRadius,
            },
          ]}
        />
        
        {/* Score */}
        <Text style={styles.score}>Score: {score}</Text>
        
        {/* Volume indicator */}
        <View style={styles.volumeContainer}>
          <Text style={styles.volumeLabel}>VOL</Text>
          <View style={styles.volumeBar}>
            <View style={[styles.volumeFill, { height: `${currentVolume * 100}%` }]} />
            <View style={[styles.volumeThreshold, { bottom: `${volumeThreshold * 10}%` }]} />
          </View>
        </View>
      </View>
      
      {/* Start Screen */}
      {gameState === 'start' && (
        <View style={styles.overlay}>
          <Text style={styles.title}>SVARA</Text>
          <Text style={styles.subtitle}>Make sound to lift the orb, stay quiet to let it fall!</Text>
          <TouchableOpacity style={styles.button} onPress={startGame}>
            <Text style={styles.buttonText}>Start Game</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={() => setShowSettings(true)}>
            <Text style={styles.buttonText}>Settings</Text>
          </TouchableOpacity>
        </View>
      )}
      
      {/* Waiting Screen */}
      {gameState === 'waiting' && (
        <View style={styles.waitingOverlay}>
          <Text style={styles.waitingText}>🎤 Start making sound to begin!</Text>
        </View>
      )}
      
      {/* Game Over Screen */}
      {gameState === 'gameOver' && (
        <View style={styles.overlay}>
          <Text style={styles.gameOverTitle}>Game Over</Text>
          <Text style={styles.finalScore}>Final Score: {score}</Text>
          <TouchableOpacity style={styles.button} onPress={startGame}>
            <Text style={styles.buttonText}>Play Again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={() => setShowSettings(true)}>
            <Text style={styles.buttonText}>Settings</Text>
          </TouchableOpacity>
        </View>
      )}
      
      {/* Settings Modal */}
      <Modal visible={showSettings} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.settingsPanel}>
            <Text style={styles.settingsTitle}>Game Settings</Text>
            
            <Text style={styles.settingLabel}>Sensitivity: {sensitivity}</Text>
            <Text style={styles.settingDesc}>How fast the ball rises when you make sound.</Text>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={10}
              step={1}
              value={sensitivity}
              onValueChange={setSensitivity}
              minimumTrackTintColor="#e94560"
              maximumTrackTintColor="#16213e"
            />
            
            <Text style={styles.settingLabel}>Volume Threshold: {volumeThreshold}</Text>
            <Text style={styles.settingDesc}>Minimum volume needed to detect your voice.</Text>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={10}
              step={1}
              value={volumeThreshold}
              onValueChange={setVolumeThreshold}
              minimumTrackTintColor="#e94560"
              maximumTrackTintColor="#16213e"
            />
            
            <Text style={styles.settingLabel}>Gravity Strength: {gravityStrength}</Text>
            <Text style={styles.settingDesc}>How fast the ball falls.</Text>
            <Slider
              style={styles.slider}
              minimumValue={-10}
              maximumValue={10}
              step={1}
              value={gravityStrength}
              onValueChange={setGravityStrength}
              minimumTrackTintColor="#e94560"
              maximumTrackTintColor="#16213e"
            />
            
            <Text style={styles.settingLabel}>Pipe Speed:</Text>
            <Text style={styles.settingDesc}>How fast the pipes move towards you.</Text>
            <View style={styles.radioGroup}>
              {Object.keys(PIPE_SPEED_LEVELS).map((level) => (
                <TouchableOpacity
                  key={level}
                  style={[
                    styles.radioOption,
                    pipeSpeedLevel === level && styles.radioSelected,
                  ]}
                  onPress={() => setPipeSpeedLevel(level)}
                >
                  <Text style={styles.radioText}>
                    {level.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            
            <TouchableOpacity style={styles.button} onPress={() => setShowSettings(false)}>
              <Text style={styles.buttonText}>Save Settings</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f3460',
  },
  gameArea: {
    flex: 1,
    position: 'relative',
  },
  pipe: {
    position: 'absolute',
    backgroundColor: '#16213e',
  },
  orb: {
    position: 'absolute',
    backgroundColor: '#f39c12',
    shadowColor: '#e94560',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 5,
  },
  score: {
    position: 'absolute',
    top: 50,
    left: 20,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#eee',
    fontFamily: 'monospace',
  },
  volumeContainer: {
    position: 'absolute',
    top: 50,
    right: 20,
    alignItems: 'center',
  },
  volumeLabel: {
    color: '#f39c12',
    fontSize: 12,
    marginBottom: 5,
    fontFamily: 'monospace',
  },
  volumeBar: {
    width: 30,
    height: 150,
    backgroundColor: '#1a1a2e',
    borderWidth: 2,
    borderColor: '#16213e',
    position: 'relative',
  },
  volumeFill: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    backgroundColor: '#f39c12',
  },
  volumeThreshold: {
    position: 'absolute',
    left: -5,
    width: 40,
    height: 3,
    backgroundColor: '#e94560',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26, 26, 46, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#e94560',
    marginBottom: 20,
  },
  subtitle: {
    fontSize: 16,
    color: '#eee',
    marginBottom: 30,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  button: {
    backgroundColor: '#e94560',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 4,
    marginVertical: 5,
    minWidth: 150,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  waitingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  waitingText: {
    backgroundColor: 'rgba(26, 26, 46, 0.9)',
    padding: 20,
    borderWidth: 2,
    borderColor: '#e94560',
    color: '#eee',
    fontSize: 18,
    textAlign: 'center',
  },
  gameOverTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#e94560',
    marginBottom: 10,
  },
  finalScore: {
    fontSize: 24,
    color: '#eee',
    marginBottom: 20,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  settingsPanel: {
    backgroundColor: 'rgba(26, 26, 46, 0.95)',
    padding: 25,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#16213e',
    width: '90%',
    maxWidth: 400,
  },
  settingsTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#e94560',
    marginBottom: 20,
    textAlign: 'center',
  },
  settingLabel: {
    color: '#eee',
    fontSize: 14,
    marginTop: 15,
    fontFamily: 'monospace',
  },
  settingDesc: {
    color: '#888',
    fontSize: 11,
    fontStyle: 'italic',
    marginBottom: 5,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  radioGroup: {
    marginTop: 10,
  },
  radioOption: {
    backgroundColor: 'rgba(22, 33, 62, 0.3)',
    padding: 10,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#16213e',
    marginVertical: 3,
  },
  radioSelected: {
    borderColor: '#e94560',
    backgroundColor: 'rgba(233, 69, 96, 0.2)',
  },
  radioText: {
    color: '#eee',
    fontSize: 14,
    fontFamily: 'monospace',
  },
});
