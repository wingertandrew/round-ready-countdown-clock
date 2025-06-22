import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Play, Pause, RotateCcw, SkipForward, Settings, Info, Plus, Minus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ClockState {
  minutes: number;
  seconds: number;
  currentRound: number;
  totalRounds: number;
  isRunning: boolean;
  isPaused: boolean;
  elapsedMinutes: number;
  elapsedSeconds: number;
  pauseStartTime: number | null;
  totalPausedTime: number;
  currentPauseDuration: number;
}

const CountdownClock = () => {
  const [clockState, setClockState] = useState<ClockState>({
    minutes: 5,
    seconds: 0,
    currentRound: 1,
    totalRounds: 3,
    isRunning: false,
    isPaused: false,
    elapsedMinutes: 0,
    elapsedSeconds: 0,
    pauseStartTime: null,
    totalPausedTime: 0,
    currentPauseDuration: 0
  });

  const [initialTime, setInitialTime] = useState({ minutes: 5, seconds: 0 });
  const [inputMinutes, setInputMinutes] = useState(5);
  const [inputSeconds, setInputSeconds] = useState(0);
  const [inputRounds, setInputRounds] = useState(3);
  const [activeTab, setActiveTab] = useState('clock');
  const [ntpOffset, setNtpOffset] = useState(0);
  const [ipAddress, setIpAddress] = useState('');

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const pauseIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();
  const wsRef = useRef<WebSocket | null>(null);

  // Get local IP address for display
  useEffect(() => {
    // This is a simple way to get the local IP - in a real Raspberry Pi environment,
    // you might want to use a more robust method
    setIpAddress(window.location.hostname || 'localhost');
  }, []);

  // WebSocket for API communication
  useEffect(() => {
    const syncWithNTP = async () => {
      try {
        const before = Date.now();
        const response = await fetch('http://worldtimeapi.org/api/timezone/Etc/UTC');
        const after = Date.now();
        const data = await response.json();
        
        const serverTime = new Date(data.datetime).getTime();
        const networkDelay = (after - before) / 2;
        const clientTime = before + networkDelay;
        const offset = serverTime - clientTime;
        
        setNtpOffset(offset);
        console.log('NTP sync completed. Offset:', offset, 'ms');
      } catch (error) {
        console.log('NTP sync failed, using local time:', error);
        setNtpOffset(0);
      }
    };

    syncWithNTP();
    const ntpInterval = setInterval(syncWithNTP, 300000);
    return () => clearInterval(ntpInterval);
  }, []);

  const getNTPTime = () => Date.now() + ntpOffset;

  // Track pause duration
  useEffect(() => {
    if (clockState.isPaused && clockState.pauseStartTime) {
      pauseIntervalRef.current = setInterval(() => {
        const currentTime = getNTPTime();
        const pauseDuration = Math.floor((currentTime - clockState.pauseStartTime!) / 1000);
        setClockState(prev => ({
          ...prev,
          currentPauseDuration: pauseDuration
        }));
      }, 1000);
    } else {
      if (pauseIntervalRef.current) {
        clearInterval(pauseIntervalRef.current);
        pauseIntervalRef.current = null;
      }
    }

    return () => {
      if (pauseIntervalRef.current) {
        clearInterval(pauseIntervalRef.current);
      }
    };
  }, [clockState.isPaused, clockState.pauseStartTime, ntpOffset]);

  useEffect(() => {
    // Only attempt WebSocket connection in production environment on Raspberry Pi
    // Skip WebSocket in development to avoid security errors
    const isProduction = window.location.protocol === 'http:' || window.location.hostname === 'localhost' || window.location.hostname.includes('raspberrypi');
    
    if (isProduction) {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.hostname}:${window.location.port || 8080}/ws`);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('WebSocket connected for external control');
        };

        ws.onmessage = (event) => {
          try {
            const command = JSON.parse(event.data);
            handleExternalCommand(command);
          } catch (error) {
            console.error('Invalid WebSocket message:', error);
          }
        };

        ws.onerror = (error) => {
          console.log('WebSocket connection failed:', error);
        };

        return () => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
        };
      } catch (error) {
        console.log('WebSocket not available in this environment');
      }
    } else {
      console.log('WebSocket disabled in development environment');
    }
  }, []);

  const handleExternalCommand = (command: any) => {
    switch (command.action) {
      case 'start':
        startTimer();
        break;
      case 'pause':
        pauseTimer();
        break;
      case 'reset':
        resetTimer();
        break;
      case 'next-round':
        nextRound();
        break;
      case 'set-time':
        if (command.minutes !== undefined && command.seconds !== undefined) {
          setTime(command.minutes, command.seconds);
        }
        break;
      case 'set-rounds':
        if (command.rounds !== undefined) {
          setRounds(command.rounds);
        }
        break;
      case 'get-status':
        broadcastStatus();
        break;
    }
  };

  const broadcastStatus = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'status',
        ...clockState,
        totalTime: initialTime,
        ntpTime: getNTPTime()
      }));
    }
  };

  useEffect(() => {
    if (clockState.isRunning && !clockState.isPaused) {
      intervalRef.current = setInterval(() => {
        setClockState(prev => {
          const newSeconds = prev.seconds - 1;
          const newMinutes = newSeconds < 0 ? prev.minutes - 1 : prev.minutes;
          const adjustedSeconds = newSeconds < 0 ? 59 : newSeconds;

          // Update elapsed time
          const totalElapsed = (initialTime.minutes * 60 + initialTime.seconds) - (newMinutes * 60 + adjustedSeconds);
          const elapsedMinutes = Math.floor(totalElapsed / 60);
          const elapsedSeconds = totalElapsed % 60;

          if (newMinutes < 0) {
            // Round completed
            if (prev.currentRound < prev.totalRounds) {
              toast({
                title: `Round ${prev.currentRound} Complete!`,
                description: `Starting round ${prev.currentRound + 1}`,
              });
              return {
                ...prev,
                currentRound: prev.currentRound + 1,
                minutes: initialTime.minutes,
                seconds: initialTime.seconds,
                elapsedMinutes: 0,
                elapsedSeconds: 0
              };
            } else {
              // All rounds completed
              toast({
                title: "All Rounds Complete!",
                description: "Countdown finished",
              });
              return {
                ...prev,
                isRunning: false,
                minutes: 0,
                seconds: 0,
                elapsedMinutes,
                elapsedSeconds
              };
            }
          }

          return {
            ...prev,
            minutes: newMinutes,
            seconds: adjustedSeconds,
            elapsedMinutes,
            elapsedSeconds
          };
        });
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [clockState.isRunning, clockState.isPaused, initialTime, toast]);

  const startTimer = () => {
    setClockState(prev => {
      let newTotalPausedTime = prev.totalPausedTime;
      if (prev.isPaused && prev.pauseStartTime) {
        newTotalPausedTime += Math.floor((getNTPTime() - prev.pauseStartTime) / 1000);
      }
      return {
        ...prev,
        isRunning: true,
        isPaused: false,
        pauseStartTime: null,
        totalPausedTime: newTotalPausedTime,
        currentPauseDuration: 0
      };
    });
    toast({ title: "Timer Started" });
  };

  const pauseTimer = () => {
    setClockState(prev => {
      if (prev.isPaused) {
        // Resuming
        let newTotalPausedTime = prev.totalPausedTime;
        if (prev.pauseStartTime) {
          newTotalPausedTime += Math.floor((getNTPTime() - prev.pauseStartTime) / 1000);
        }
        return {
          ...prev,
          isPaused: false,
          pauseStartTime: null,
          totalPausedTime: newTotalPausedTime,
          currentPauseDuration: 0
        };
      } else {
        // Pausing
        return {
          ...prev,
          isPaused: true,
          pauseStartTime: getNTPTime()
        };
      }
    });
    toast({ title: clockState.isPaused ? "Timer Resumed" : "Timer Paused" });
  };

  const togglePlayPause = () => {
    if (!clockState.isRunning || clockState.isPaused) {
      startTimer();
    } else {
      pauseTimer();
    }
  };

  const resetTimer = () => {
    setClockState(prev => ({
      ...prev,
      isRunning: false,
      isPaused: false,
      minutes: initialTime.minutes,
      seconds: initialTime.seconds,
      currentRound: 1,
      elapsedMinutes: 0,
      elapsedSeconds: 0,
      pauseStartTime: null,
      totalPausedTime: 0,
      currentPauseDuration: 0
    }));
    toast({ title: "Timer Reset" });
  };

  const nextRound = () => {
    if (clockState.currentRound < clockState.totalRounds) {
      setClockState(prev => ({
        ...prev,
        currentRound: prev.currentRound + 1,
        minutes: initialTime.minutes,
        seconds: initialTime.seconds,
        elapsedMinutes: 0,
        elapsedSeconds: 0,
        totalPausedTime: 0,
        currentPauseDuration: 0,
        pauseStartTime: null
      }));
      toast({ title: `Round ${clockState.currentRound + 1} Started` });
    }
  };

  const setTime = (minutes: number, seconds: number) => {
    const validMinutes = Math.max(0, Math.min(59, minutes));
    const validSeconds = Math.max(0, Math.min(59, seconds));
    
    setInitialTime({ minutes: validMinutes, seconds: validSeconds });
    setClockState(prev => ({
      ...prev,
      minutes: validMinutes,
      seconds: validSeconds,
      isRunning: false,
      isPaused: false,
      elapsedMinutes: 0,
      elapsedSeconds: 0,
      pauseStartTime: null,
      totalPausedTime: 0,
      currentPauseDuration: 0
    }));
  };

  const setRounds = (rounds: number) => {
    const validRounds = Math.max(1, Math.min(15, rounds));
    setClockState(prev => ({
      ...prev,
      totalRounds: validRounds,
      currentRound: 1
    }));
  };

  const applySettings = () => {
    setTime(inputMinutes, inputSeconds);
    setRounds(inputRounds);
    setActiveTab('clock');
    toast({ title: "Settings Applied" });
  };

  const formatTime = (minutes: number, seconds: number) => {
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatDuration = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getStatusText = () => {
    if (clockState.isPaused) return 'PAUSED';
    if (clockState.isRunning) return 'RUNNING';
    return 'READY';
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full">
        <TabsList className="grid w-full grid-cols-3 mb-4 bg-gray-800 border-gray-700">
          <TabsTrigger value="clock" className="text-lg py-3 data-[state=active]:bg-gray-600">Clock</TabsTrigger>
          <TabsTrigger value="settings" className="text-lg py-3 data-[state=active]:bg-gray-600">
            <Settings className="w-5 h-5 mr-2" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="info" className="text-lg py-3 data-[state=active]:bg-gray-600">
            <Info className="w-5 h-5 mr-2" />
            API Info
          </TabsTrigger>
        </TabsList>

        <TabsContent value="clock" className="space-y-4 p-4">
          {/* Main Timer Card - Inspired by the uploaded design */}
          <div className="bg-gray-800 rounded-3xl p-8 border-4 border-gray-600">
            {/* Elapsed Time Header */}
            <div className="text-center mb-4">
              <div className="flex items-center justify-center gap-4 text-white text-xl font-bold mb-2">
                <div className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center">
                  <div className="w-3 h-3 bg-white rounded-full"></div>
                </div>
                <span>ELAPSED: {formatTime(clockState.elapsedMinutes, clockState.elapsedSeconds)}</span>
              </div>
            </div>

            {/* Main Timer Display */}
            <div className="bg-black rounded-2xl p-12 mb-6">
              <div className="text-center">
                <div className="text-[12rem] md:text-[16rem] font-bold tracking-wider text-white leading-none font-mono">
                  {formatTime(clockState.minutes, clockState.seconds)}
                </div>
              </div>
            </div>

            {/* Status Bar */}
            <div className="bg-gray-300 rounded-xl p-6 mb-4">
              <div className="flex items-center justify-center gap-4 text-black text-3xl font-bold">
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-8 h-8" />
                  <span>{getStatusText()}</span>
                </div>
                {clockState.isPaused && (
                  <span className="text-yellow-600">
                    - {formatDuration(clockState.currentPauseDuration)}
                  </span>
                )}
              </div>
            </div>

            {/* IP Address */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-2 text-white text-lg">
                <div className="w-3 h-3 bg-white rounded-full"></div>
                <span>{ipAddress}</span>
              </div>
            </div>

            {/* Control Buttons */}
            <div className="grid grid-cols-5 gap-4">
              <Button
                onClick={() => setTime(Math.max(0, clockState.minutes - 1), clockState.seconds)}
                disabled={clockState.isRunning}
                className="h-20 bg-gray-600 hover:bg-gray-500 text-black rounded-2xl"
              >
                <Plus className="w-8 h-8" />
              </Button>
              
              <Button
                onClick={() => setTime(Math.min(59, clockState.minutes + 1), clockState.seconds)}
                disabled={clockState.isRunning}
                className="h-20 bg-gray-600 hover:bg-gray-500 text-black rounded-2xl"
              >
                <Minus className="w-8 h-8" />
              </Button>

              <Button
                onClick={togglePlayPause}
                className="h-20 bg-gray-600 hover:bg-gray-500 text-black rounded-2xl text-4xl"
              >
                {clockState.isRunning && !clockState.isPaused ? (
                  <div className="w-6 h-8 bg-black"></div>
                ) : (
                  <Play className="w-8 h-8 fill-black" />
                )}
              </Button>

              <Button
                onClick={resetTimer}
                className="h-20 bg-gray-600 hover:bg-gray-500 text-black rounded-2xl"
              >
                <div className="w-6 h-6 bg-black rounded-sm"></div>
              </Button>

              <Button
                onClick={nextRound}
                disabled={clockState.currentRound >= clockState.totalRounds}
                className="h-20 bg-gray-600 hover:bg-gray-500 text-black rounded-2xl"
              >
                <RotateCcw className="w-8 h-8" />
              </Button>
            </div>

            {/* Round Info */}
            <div className="text-center mt-6 text-white text-xl">
              Round {clockState.currentRound} of {clockState.totalRounds}
              {clockState.totalPausedTime > 0 && (
                <div className="text-yellow-400 text-lg mt-2">
                  Total Paused: {formatDuration(clockState.totalPausedTime)}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-2xl text-white">Timer Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="flex flex-col items-center">
                  <label className="block text-lg font-medium mb-4 text-white">Minutes</label>
                  <Input
                    type="number"
                    min="0"
                    max="59"
                    value={inputMinutes}
                    onChange={(e) => setInputMinutes(parseInt(e.target.value) || 0)}
                    className="text-5xl h-24 bg-gray-700 border-gray-600 text-center text-white"
                  />
                  <div className="flex gap-4 mt-4">
                    <Button
                      onClick={() => setInputMinutes(Math.max(0, inputMinutes - 1))}
                      size="lg"
                      className="h-16 w-16 text-2xl bg-red-600 hover:bg-red-700"
                    >
                      <Minus className="w-8 h-8" />
                    </Button>
                    <Button
                      onClick={() => setInputMinutes(Math.min(59, inputMinutes + 1))}
                      size="lg"
                      className="h-16 w-16 text-2xl bg-green-600 hover:bg-green-700"
                    >
                      <Plus className="w-8 h-8" />
                    </Button>
                  </div>
                </div>
                
                <div className="flex flex-col items-center">
                  <label className="block text-lg font-medium mb-4 text-white">Seconds</label>
                  <Input
                    type="number"
                    min="0"
                    max="59"
                    value={inputSeconds}
                    onChange={(e) => setInputSeconds(parseInt(e.target.value) || 0)}
                    className="text-5xl h-24 bg-gray-700 border-gray-600 text-center text-white"
                  />
                  <div className="flex gap-4 mt-4">
                    <Button
                      onClick={() => setInputSeconds(Math.max(0, inputSeconds - 1))}
                      size="lg"
                      className="h-16 w-16 text-2xl bg-red-600 hover:bg-red-700"
                    >
                      <Minus className="w-8 h-8" />
                    </Button>
                    <Button
                      onClick={() => setInputSeconds(Math.min(59, inputSeconds + 1))}
                      size="lg"
                      className="h-16 w-16 text-2xl bg-green-600 hover:bg-green-700"
                    >
                      <Plus className="w-8 h-8" />
                    </Button>
                  </div>
                </div>
                
                <div className="flex flex-col items-center">
                  <label className="block text-lg font-medium mb-4 text-white">Rounds (1-15)</label>
                  <Input
                    type="number"
                    min="1"
                    max="15"
                    value={inputRounds}
                    onChange={(e) => setInputRounds(parseInt(e.target.value) || 1)}
                    className="text-5xl h-24 bg-gray-700 border-gray-600 text-center text-white"
                  />
                  <div className="flex gap-4 mt-4">
                    <Button
                      onClick={() => setInputRounds(Math.max(1, inputRounds - 1))}
                      size="lg"
                      className="h-16 w-16 text-2xl bg-red-600 hover:bg-red-700"
                    >
                      <Minus className="w-8 h-8" />
                    </Button>
                    <Button
                      onClick={() => setInputRounds(Math.min(15, inputRounds + 1))}
                      size="lg"
                      className="h-16 w-16 text-2xl bg-green-600 hover:bg-green-700"
                    >
                      <Plus className="w-8 h-8" />
                    </Button>
                  </div>
                </div>
              </div>
              
              <Button
                onClick={applySettings}
                size="lg"
                className="w-full h-16 text-xl bg-green-600 hover:bg-green-700"
              >
                Apply Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="info" className="space-y-6">
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-2xl text-white">HTTP API Documentation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-lg text-gray-300 mb-6">
                Base URL: <code className="bg-gray-900 px-2 py-1 rounded">http://&lt;raspberry-pi-ip&gt;:8080/api</code>
              </div>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold text-green-400 mb-2">Timer Controls</h3>
                  <div className="space-y-3 text-sm">
                    <div className="bg-gray-900 p-3 rounded">
                      <code className="text-green-300">POST /start</code>
                      <p className="text-gray-300 mt-1">Start the countdown timer</p>
                    </div>
                    <div className="bg-gray-900 p-3 rounded">
                      <code className="text-yellow-300">POST /pause</code>
                      <p className="text-gray-300 mt-1">Pause/Resume the timer</p>
                    </div>
                    <div className="bg-gray-900 p-3 rounded">
                      <code className="text-red-300">POST /reset</code>
                      <p className="text-gray-300 mt-1">Reset timer to initial settings</p>
                    </div>
                    <div className="bg-gray-900 p-3 rounded">
                      <code className="text-blue-300">POST /next-round</code>
                      <p className="text-gray-300 mt-1">Skip to next round</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-blue-400 mb-2">Configuration</h3>
                  <div className="space-y-3 text-sm">
                    <div className="bg-gray-900 p-3 rounded">
                      <code className="text-purple-300">POST /set-time</code>
                      <p className="text-gray-300 mt-1">Body: <code>{"{"}"minutes": 5, "seconds": 30{"}"}</code></p>
                    </div>
                    <div className="bg-gray-900 p-3 rounded">
                      <code className="text-purple-300">POST /set-rounds</code>
                      <p className="text-gray-300 mt-1">Body: <code>{"{"}"rounds": 10{"}"}</code></p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-cyan-400 mb-2">Status & Display Pages</h3>
                  <div className="space-y-3 text-sm">
                    <div className="bg-gray-900 p-3 rounded">
                      <code className="text-cyan-300">GET /status</code>
                      <p className="text-gray-300 mt-1">Get current timer state and settings</p>
                    </div>
                    <div className="bg-gray-900 p-3 rounded">
                      <code className="text-cyan-300">GET /clockpretty</code>
                      <p className="text-gray-300 mt-1">Beautiful dark dashboard display (read-only)</p>
                    </div>
                    <div className="bg-gray-900 p-3 rounded">
                      <code className="text-cyan-300">GET /clockarena</code>
                      <p className="text-gray-300 mt-1">Compact arena-style countdown display</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-orange-400 mb-2">Stream Deck Integration</h3>
                  <div className="bg-gray-900 p-4 rounded text-sm">
                    <p className="text-gray-300 mb-2">For Stream Deck with Companion:</p>
                    <ul className="list-disc list-inside space-y-1 text-gray-400">
                      <li>Use HTTP Request actions</li>
                      <li>Set method to POST for controls</li>
                      <li>Use GET for status checks</li>
                      <li>Configure with your Pi's IP address</li>
                      <li>NTP synchronized for accurate timing</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CountdownClock;
