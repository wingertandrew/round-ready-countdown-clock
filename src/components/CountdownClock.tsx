
import React, { useState, useEffect, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, Info, Bug } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ClockState } from '@/types/clock';
import { useDebugLog } from '@/hooks/useDebugLog';
import { syncWithNTP, getNTPTime } from '@/utils/ntpUtils';
import ClockDisplay from './ClockDisplay';
import SettingsTab from './SettingsTab';
import ApiInfoTab from './ApiInfoTab';
import DebugTab from './DebugTab';

const DEFAULT_NTP_SYNC_INTERVAL = 30 * 60 * 1000; // 30 minutes

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
    currentPauseDuration: 0,
    isBetweenRounds: false,
    betweenRoundsMinutes: 0,
    betweenRoundsSeconds: 0,
    betweenRoundsEnabled: true,
    betweenRoundsTime: 60
  });

  const [initialTime, setInitialTime] = useState({ minutes: 5, seconds: 0 });
  const [inputMinutes, setInputMinutes] = useState(5);
  const [inputSeconds, setInputSeconds] = useState(0);
  const [inputRounds, setInputRounds] = useState(3);
  const [betweenRoundsEnabled, setBetweenRoundsEnabled] = useState(true);
  const [betweenRoundsTime, setBetweenRoundsTime] = useState(60);
  const [activeTab, setActiveTab] = useState('clock');
  const [ntpOffset, setNtpOffset] = useState(0);
  const [ipAddress, setIpAddress] = useState('');
  const [ntpServer, setNtpServer] = useState('time.google.com');
  const [ntpEnabled, setNtpEnabled] = useState(true);
  const [ntpDrift, setNtpDrift] = useState(0);
  const [lastNtpSync, setLastNtpSync] = useState('');
  const [connectedClients, setConnectedClients] = useState<any[]>([]);

  const { toast } = useToast();
  const wsRef = useRef<WebSocket | null>(null);
  
  const { addDebugLog, ...debugLogProps } = useDebugLog();

  // Get local IP address for display
  useEffect(() => {
    setIpAddress(window.location.hostname || 'localhost');
  }, []);

  const handleSyncWithNTP = async () => {
    try {
      const { offset, lastSync } = await syncWithNTP(ntpServer);
      setNtpOffset(offset);
      setLastNtpSync(lastSync);
      addDebugLog('API', 'NTP sync completed', { offset, server: ntpServer });
    } catch (error) {
      addDebugLog('API', 'NTP sync failed', { error: error.message, fallback: 'local time' });
      setNtpOffset(0);
    }
  };

  useEffect(() => {
    if (!ntpEnabled) return;
    handleSyncWithNTP();
    const ntpInterval = setInterval(
      handleSyncWithNTP,
      DEFAULT_NTP_SYNC_INTERVAL
    );
    return () => clearInterval(ntpInterval);
  }, [ntpServer, ntpEnabled, handleSyncWithNTP]);

  // WebSocket for server communication
  useEffect(() => {
    const connectWebSocket = () => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        console.log('Connecting to WebSocket:', wsUrl);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('WebSocket connected - syncing with server');
          addDebugLog('WEBSOCKET', 'Connected to server', { endpoint: wsUrl });
          
          // Sync current settings to server
          ws.send(JSON.stringify({
            type: 'sync-settings',
            url: window.location.href,
            initialTime,
            totalRounds: inputRounds,
            betweenRoundsEnabled,
            betweenRoundsTime
          }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            addDebugLog('WEBSOCKET', 'Received from server', data);
            
            if (data.type === 'status') {
              // Update local state from server
              setClockState(prev => ({
                ...prev,
                ...data,
                pauseStartTime: data.pauseStartTime
              }));

              if (typeof data.betweenRoundsEnabled === 'boolean') {
                setBetweenRoundsEnabled(data.betweenRoundsEnabled);
              }
              if (typeof data.betweenRoundsTime === 'number') {
                setBetweenRoundsTime(data.betweenRoundsTime);
              }
              
              if (data.initialTime) {
                setInitialTime(data.initialTime);
              }
            } else if (data.type === 'clients') {
              setConnectedClients(data.clients || []);
              addDebugLog('WEBSOCKET', 'Connected clients updated', { count: data.clients?.length || 0 });
            } else {
              handleExternalCommand(data);
            }
          } catch (error) {
            console.error('Invalid WebSocket message:', error);
            addDebugLog('WEBSOCKET', 'Invalid message', { error: error.message });
          }
        };

        ws.onerror = (error) => {
          console.log('WebSocket connection failed:', error);
          addDebugLog('WEBSOCKET', 'Connection failed', { error });
        };

        ws.onclose = () => {
          console.log('WebSocket connection closed, attempting to reconnect...');
          addDebugLog('WEBSOCKET', 'Connection closed, reconnecting');
          setTimeout(connectWebSocket, 2000);
        };

        return () => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
        };
      } catch (error) {
        console.log('WebSocket not available:', error);
        addDebugLog('WEBSOCKET', 'Not available', { error: error.message });
      }
    };

    connectWebSocket();
  }, []);

  const handleExternalCommand = (command: any) => {
    addDebugLog('API', 'External command received', command);
    // Commands are now handled server-side, client just receives updates
    switch (command.action) {
      case 'start':
        toast({ title: "Timer Started" });
        break;
      case 'pause':
        toast({ title: clockState.isPaused ? "Timer Resumed" : "Timer Paused" });
        break;
      case 'reset':
        toast({ title: 'Timer Reset' });
        break;
      case 'reset-time':
        toast({ title: 'Time Reset' });
        break;
      case 'reset-rounds':
        toast({ title: 'Rounds Reset' });
        break;
      case 'set-time':
        setInitialTime({ minutes: command.minutes, seconds: command.seconds });
        setClockState(prev => ({
          ...prev,
          minutes: command.minutes,
          seconds: command.seconds
        }));
        toast({ title: 'Time Set' });
        break;
      case 'next-round':
        toast({ title: `Round ${clockState.currentRound + 1} Started` });
        break;
      case 'previous-round':
        toast({ title: `Round ${clockState.currentRound - 1} Started` });
        break;
      case 'adjust-time':
        toast({ title: 'Time Adjusted' });
        break;
    }
  };

  const startTimer = async () => {
    try {
      const response = await fetch('/api/start', { method: 'POST' });
      if (response.ok) {
        addDebugLog('UI', 'Timer started via API');
      }
    } catch (error) {
      addDebugLog('UI', 'Failed to start timer', { error: error.message });
    }
  };

  const pauseTimer = async () => {
    try {
      const response = await fetch('/api/pause', { method: 'POST' });
      if (response.ok) {
        addDebugLog('UI', 'Timer paused/resumed via API');
      }
    } catch (error) {
      addDebugLog('UI', 'Failed to pause/resume timer', { error: error.message });
    }
  };

  const togglePlayPause = () => {
    if (!clockState.isRunning || clockState.isPaused) {
      startTimer();
    } else {
      pauseTimer();
    }
  };

  const resetTime = async () => {
    try {
      const response = await fetch('/api/reset-time', { method: 'POST' });
      if (response.ok) {
        addDebugLog('UI', 'Time reset via API');
      }
    } catch (error) {
      addDebugLog('UI', 'Failed to reset time', { error: error.message });
    }
  };

  const resetRounds = async () => {
    try {
      const response = await fetch('/api/reset-rounds', { method: 'POST' });
      if (response.ok) {
        addDebugLog('UI', 'Rounds reset via API');
      }
    } catch (error) {
      addDebugLog('UI', 'Failed to reset rounds', { error: error.message });
    }
  };

  const resetTimer = () => {
    resetRounds();
  };

  const nextRound = async () => {
    if (clockState.currentRound < clockState.totalRounds) {
      try {
        const response = await fetch('/api/next-round', { method: 'POST' });
        if (response.ok) {
          addDebugLog('UI', 'Next round via API', {
            round: clockState.currentRound + 1
          });
        }
      } catch (error) {
        addDebugLog('UI', 'Failed to advance round', { error: error.message });
      }

      const newRound = clockState.currentRound + 1;
      setClockState(prev => ({
        ...prev,
        currentRound: newRound,
        minutes: initialTime.minutes,
        seconds: initialTime.seconds,
        isRunning: false,
        isPaused: false,
        elapsedMinutes: 0,
        elapsedSeconds: 0,
        isBetweenRounds: false
      }));
    }
  };

  const previousRound = () => {
    if (clockState.currentRound > 1) {
      const newRound = clockState.currentRound - 1;
      setClockState(prev => ({
        ...prev,
        currentRound: newRound,
        minutes: initialTime.minutes,
        seconds: initialTime.seconds,
        isRunning: false,
        isPaused: false,
        elapsedMinutes: 0,
        elapsedSeconds: 0,
        isBetweenRounds: false
      }));
      addDebugLog('UI', 'Previous round', { round: newRound });
    }
  };

  const adjustTimeBySeconds = (secondsToAdd: number) => {
    if (clockState.isRunning && !clockState.isPaused) return; // Don't adjust while running
    if (clockState.isBetweenRounds) return; // Don't adjust during between rounds
    
    setClockState(prev => {
      let newMinutes = prev.minutes;
      let newSeconds = prev.seconds + secondsToAdd;
      
      // Handle seconds overflow/underflow
      while (newSeconds >= 60) {
        newSeconds -= 60;
        newMinutes += 1;
      }
      while (newSeconds < 0 && (newMinutes > 0 || newSeconds > -60)) {
        newSeconds += 60;
        newMinutes -= 1;
      }
      
      // Ensure we don't go below 0:00
      if (newMinutes < 0) {
        newMinutes = 0;
        newSeconds = 0;
      }
      
      // Cap at 59:59
      if (newMinutes > 59) {
        newMinutes = 59;
        newSeconds = 59;
      }
      
      return {
        ...prev,
        minutes: newMinutes,
        seconds: newSeconds
      };
    });
    
    addDebugLog('UI', 'Time adjusted by seconds', { adjustment: secondsToAdd });
  };

  const setTime = async (minutes: number, seconds: number) => {
    const validMinutes = Math.max(0, Math.min(59, minutes));
    const validSeconds = Math.max(0, Math.min(59, seconds));
    
    try {
      const response = await fetch('/api/set-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes: validMinutes, seconds: validSeconds })
      });
      
      if (response.ok) {
        setInitialTime({ minutes: validMinutes, seconds: validSeconds });
        // Update displayed time immediately so UI reflects the change
        setClockState(prev => ({
          ...prev,
          minutes: validMinutes,
          seconds: validSeconds
        }));
        addDebugLog('UI', 'Time set via API', { minutes: validMinutes, seconds: validSeconds });
      }
    } catch (error) {
      addDebugLog('UI', 'Failed to set time', { error: error.message });
    }
  };

  const setRounds = async (rounds: number) => {
    const validRounds = Math.max(1, Math.min(15, rounds));
    
    try {
      const response = await fetch('/api/set-rounds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rounds: validRounds })
      });
      
      if (response.ok) {
        addDebugLog('UI', 'Rounds set via API', { rounds: validRounds });
      }
    } catch (error) {
      addDebugLog('UI', 'Failed to set rounds', { error: error.message });
    }
  };

  const applySettings = async () => {
    addDebugLog('UI', 'Settings applied', { 
      time: { minutes: inputMinutes, seconds: inputSeconds },
      rounds: inputRounds,
      betweenRoundsEnabled,
      betweenRoundsTime
    });
    
    await setTime(inputMinutes, inputSeconds);
    await setRounds(inputRounds);
    
    // Sync between rounds settings
    try {
      await fetch('/api/set-between-rounds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: betweenRoundsEnabled, time: betweenRoundsTime })
      });
    } catch (error) {
      addDebugLog('UI', 'Failed to set between rounds settings', { error: error.message });
    }
    
    setActiveTab('clock');
    toast({ title: "Settings Applied" });
  };

  const handleCommandCopy = (command: string) => {
    addDebugLog('UI', 'Command copied', { command });
    toast({ title: 'Command Copied', description: command });
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full">
        <TabsList className="grid w-full grid-cols-4 mb-4 bg-gray-800 border-gray-700">
          <TabsTrigger value="clock" className="text-lg py-3 data-[state=active]:bg-gray-600">Clock</TabsTrigger>
          <TabsTrigger value="settings" className="text-lg py-3 data-[state=active]:bg-gray-600">
            <Settings className="w-5 h-5 mr-2" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="info" className="text-lg py-3 data-[state=active]:bg-gray-600">
            <Info className="w-5 h-5 mr-2" />
            API Info
          </TabsTrigger>
          <TabsTrigger value="debug" className="text-lg py-3 data-[state=active]:bg-gray-600">
            <Bug className="w-5 h-5 mr-2" />
            Debug
          </TabsTrigger>
        </TabsList>

        <TabsContent value="clock" className="space-y-4">
          <ClockDisplay
            clockState={clockState}
            ipAddress={ipAddress}
            betweenRoundsEnabled={betweenRoundsEnabled}
            betweenRoundsTime={betweenRoundsTime}
            onTogglePlayPause={togglePlayPause}
            onNextRound={nextRound}
            onPreviousRound={previousRound}
            onResetTime={resetTime}
            onResetRounds={resetRounds}
            onAdjustTimeBySeconds={adjustTimeBySeconds}
          />
        </TabsContent>

        <TabsContent value="settings">
          <SettingsTab
            inputMinutes={inputMinutes}
            inputSeconds={inputSeconds}
            inputRounds={inputRounds}
            betweenRoundsEnabled={betweenRoundsEnabled}
            betweenRoundsTime={betweenRoundsTime}
          ntpOffset={ntpOffset}
          ntpServer={ntpServer}
          lastNtpSync={lastNtpSync}
          ntpDrift={ntpDrift}
          ntpEnabled={ntpEnabled}
          setInputMinutes={setInputMinutes}
          setInputSeconds={setInputSeconds}
          setInputRounds={setInputRounds}
          setBetweenRoundsEnabled={setBetweenRoundsEnabled}
          setBetweenRoundsTime={setBetweenRoundsTime}
          setNtpServer={setNtpServer}
          setNtpEnabled={setNtpEnabled}
          onApplySettings={applySettings}
          onSyncWithNTP={handleSyncWithNTP}
        />
        </TabsContent>

        <TabsContent value="info">
          <ApiInfoTab
            ipAddress={ipAddress}
            onCommandCopy={handleCommandCopy}
          />
        </TabsContent>

        <TabsContent value="debug">
          <DebugTab
            {...debugLogProps}
            onClearDebugLog={debugLogProps.clearDebugLog}
            connectedClients={connectedClients}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CountdownClock;
