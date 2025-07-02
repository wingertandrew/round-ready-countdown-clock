import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Clock, Plus, Minus, Wifi, WifiOff } from 'lucide-react';

interface SettingsTabProps {
  inputMinutes: number;
  inputSeconds: number;
  inputRounds: number;
  betweenRoundsEnabled: boolean;
  betweenRoundsTime: number;
  ntpOffset: number;
  ntpServer: string;
  lastNtpSync: string;
  ntpDrift: number;
  ntpEnabled: boolean;
  setInputMinutes: (value: number) => void;
  setInputSeconds: (value: number) => void;
  setInputRounds: (value: number) => void;
  setBetweenRoundsEnabled: (enabled: boolean) => void;
  setBetweenRoundsTime: (time: number) => void;
  setNtpServer: (server: string) => void;
  setNtpEnabled: (enabled: boolean) => void;
  onApplySettings: () => void;
  onSyncWithNTP: () => void;
}

const isValidNtpUrl = (url: string): boolean => {
  // Basic validation for NTP server URL
  const ntpPattern = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$|^(\d{1,3}\.){3}\d{1,3}$/;
  return ntpPattern.test(url.trim());
};

const SettingsTab: React.FC<SettingsTabProps> = ({
  inputMinutes,
  inputSeconds,
  inputRounds,
  betweenRoundsEnabled,
  betweenRoundsTime,
  ntpOffset,
  ntpServer,
  lastNtpSync,
  ntpDrift,
  ntpEnabled,
  setInputMinutes,
  setInputSeconds,
  setInputRounds,
  setBetweenRoundsEnabled,
  setBetweenRoundsTime,
  setNtpServer,
  setNtpEnabled,
  onApplySettings,
  onSyncWithNTP
}) => {
  return (
    <div className="space-y-6 p-4 min-h-screen bg-gray-900">
      <Card className="bg-gray-800 border-gray-600">
        <CardHeader>
          <CardTitle className="text-4xl text-white mb-4">Timer Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="flex flex-col items-center">
              <label className="block text-3xl font-medium mb-6 text-white">Minutes</label>
              <Input type="number" min="0" max="59" value={inputMinutes} onChange={e => setInputMinutes(Math.max(0, parseInt(e.target.value) || 0))} className="h-32 bg-gray-700 border-gray-500 text-center text-white text-8xl font-bold rounded-2xl" />
              <div className="flex gap-6 mt-6">
                <Button onClick={() => setInputMinutes(Math.max(0, inputMinutes - 1))} size="lg" className="h-24 w-24 text-6xl bg-gray-400 hover:bg-gray-300 text-black rounded-xl">
                  <Minus className="w-12 h-12" />
                </Button>
                <Button onClick={() => setInputMinutes(Math.min(59, inputMinutes + 1))} size="lg" className="h-24 w-24 text-6xl bg-gray-400 hover:bg-gray-300 text-black rounded-xl">
                  <Plus className="w-12 h-12" />
                </Button>
              </div>
            </div>
            
            <div className="flex flex-col items-center">
              <label className="block text-3xl font-medium mb-6 text-white">Seconds</label>
              <Input type="number" min="0" max="59" value={inputSeconds} onChange={e => setInputSeconds(Math.max(0, parseInt(e.target.value) || 0))} className="h-32 bg-gray-700 border-gray-500 text-center text-white text-8xl font-bold rounded-2xl" />
              <div className="flex gap-6 mt-6">
                <Button onClick={() => setInputSeconds(Math.max(0, inputSeconds - 1))} size="lg" className="h-24 w-24 text-6xl bg-gray-400 hover:bg-gray-300 text-black rounded-xl">
                  <Minus className="w-12 h-12" />
                </Button>
                <Button onClick={() => setInputSeconds(Math.min(59, inputSeconds + 1))} size="lg" className="h-24 w-24 text-6xl bg-gray-400 hover:bg-gray-300 text-black rounded-xl">
                  <Plus className="w-12 h-12" />
                </Button>
              </div>
            </div>
            
            <div className="flex flex-col items-center">
              <label className="block text-3xl font-medium mb-6 text-white">Rounds (1-15)</label>
              <Input type="number" min="1" max="15" value={inputRounds} onChange={e => setInputRounds(parseInt(e.target.value) || 1)} className="h-32 bg-gray-700 border-gray-500 text-center text-white text-8xl font-bold rounded-2xl" />
              <div className="flex gap-6 mt-6">
                <Button onClick={() => setInputRounds(Math.max(1, inputRounds - 1))} size="lg" className="h-24 w-24 text-6xl bg-gray-400 hover:bg-gray-300 text-black rounded-xl">
                  <Minus className="w-12 h-12" />
                </Button>
                <Button onClick={() => setInputRounds(Math.min(15, inputRounds + 1))} size="lg" className="h-24 w-24 text-6xl bg-gray-400 hover:bg-gray-300 text-black rounded-xl">
                  <Plus className="w-12 h-12" />
                </Button>
              </div>
            </div>
          </div>

          {/* Between Rounds Settings */}
          <Card className="bg-gray-700 border-gray-500">
            <CardHeader>
              <CardTitle className="text-2xl text-white flex items-center gap-3">
                <Clock className="w-8 h-8" />
                Between Rounds Timer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <h3 className="text-xl text-white font-semibold">Enable Between Rounds Timer</h3>
                  <p className="text-gray-300 text-lg">
                    Automatically start a count-up timer between rounds
                  </p>
                </div>
                <Switch
                  checked={betweenRoundsEnabled}
                  onCheckedChange={setBetweenRoundsEnabled}
                  className="scale-150"
                />
              </div>
              
              {betweenRoundsEnabled && (
                <div className="flex flex-col items-center space-y-4">
                  <label className="block text-2xl font-medium text-white">
                    Between Rounds Duration (seconds)
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="300"
                    value={betweenRoundsTime}
                    onChange={(e) => setBetweenRoundsTime(parseInt(e.target.value) || 60)}
                    className="h-20 bg-gray-700 border-gray-500 text-center text-white text-4xl font-bold rounded-2xl max-w-xs"
                  />
                  <div className="flex gap-4">
                    <Button
                      onClick={() => setBetweenRoundsTime(Math.max(1, betweenRoundsTime - 15))}
                      size="lg"
                      className="h-16 w-16 text-4xl bg-gray-400 hover:bg-gray-300 text-black rounded-xl"
                    >
                      <Minus className="w-8 h-8" />
                    </Button>
                    <Button
                      onClick={() => setBetweenRoundsTime(Math.min(300, betweenRoundsTime + 15))}
                      size="lg"
                      className="h-16 w-16 text-4xl bg-gray-400 hover:bg-gray-300 text-black rounded-xl"
                    >
                      <Plus className="w-8 h-8" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* NTP Status Section */}
          <Card className="bg-gray-700 border-gray-500">
            <CardHeader>
              <CardTitle className="text-2xl text-white flex items-center gap-3">
                <Clock className="w-8 h-8" />
                Network Time Synchronization
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <h3 className="text-xl text-white font-semibold">Enable NTP Sync</h3>
                  <p className="text-gray-300 text-lg">Periodically sync clock with NTP server</p>
                </div>
                <Switch
                  checked={ntpEnabled}
                  onCheckedChange={setNtpEnabled}
                  className="scale-150"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    {ntpEnabled && ntpOffset !== null ? (
                      <Wifi className="w-6 h-6 text-green-400" />
                    ) : (
                      <WifiOff className="w-6 h-6 text-red-400" />
                    )}
                    <span className="text-xl text-white">
                      Status:{' '}
                      {ntpEnabled ? (ntpOffset !== null ? 'Synchronized' : 'Failed') : 'Disabled'}
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="block text-lg text-white font-medium">NTP Server URL:</label>
                    <Input
                      type="text"
                      value={ntpServer}
                      onChange={(e) => setNtpServer(e.target.value)}
                      placeholder="time.google.com"
                      className="h-12 bg-gray-700 border-gray-500 text-white text-lg"
                    />
                    {ntpServer && !isValidNtpUrl(ntpServer) && (
                      <p className="text-red-400 text-sm">Invalid NTP server format</p>
                    )}
                  </div>
                  
                  <div className="text-lg text-gray-300">
                    <strong className="text-white">Last Sync:</strong> {lastNtpSync || 'Never'}
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="text-lg text-gray-300">
                    <strong className="text-white">Offset:</strong> {ntpOffset !== null ? `${ntpOffset}ms` : 'N/A'}
                  </div>
                  
                  <div className="text-lg text-gray-300">
                    <strong className="text-white">Drift:</strong> {ntpDrift !== null ? `${ntpDrift}ms/min` : 'N/A'}
                  </div>
                  
                  <Button onClick={onSyncWithNTP} className="h-12 text-lg bg-blue-600 hover:bg-blue-700">
                    <Clock className="w-5 h-5 mr-2" />
                    Sync Now
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Button
            onClick={onApplySettings}
            size="lg"
            className="w-full h-24 text-3xl bg-gray-400 hover:bg-gray-300 text-black rounded-xl"
          >
            Apply Settings
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsTab;
