
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download } from 'lucide-react';
import { DebugLogEntry, DebugFilter } from '@/types/clock';
import { downloadCSV } from '@/utils/clockUtils';

interface DebugTabProps {
  debugLog: DebugLogEntry[];
  debugFilter: DebugFilter;
  setDebugFilter: (filter: DebugFilter) => void;
  onClearDebugLog: () => void;
  filteredDebugLog: DebugLogEntry[];
  connectedClients: any[];
}

const DebugTab: React.FC<DebugTabProps> = ({
  debugLog,
  debugFilter,
  setDebugFilter,
  onClearDebugLog,
  filteredDebugLog,
  connectedClients
}) => {
  const handleDownloadCSV = () => {
    const csvData = debugLog.map(entry => ({
      timestamp: entry.timestamp,
      source: entry.source,
      action: entry.action,
      details: entry.details ? JSON.stringify(entry.details) : ''
    }));
    
    const filename = `countdown-clock-log-${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(csvData, filename);
  };

  return (
    <div className="space-y-6 p-4 min-h-screen bg-gray-900">
      <Card className="bg-gray-800 border-gray-600">
        <CardHeader>
          <CardTitle className="text-3xl text-white mb-4">Connected Clients ({connectedClients.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {connectedClients.map((client, index) => (
              <div key={index} className="bg-gray-700 p-4 rounded-xl border border-gray-600">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-white font-semibold">Client {index + 1}</span>
                </div>
                <div className="text-gray-300 text-sm space-y-1">
                  <div>ID: {client.id || 'Unknown'}</div>
                  <div>Connected: {client.connectedAt ? new Date(client.connectedAt).toLocaleTimeString() : 'Unknown'}</div>
                  <div>IP: {client.ip || 'Unknown'}</div>
                  <div>URL: {client.url || 'Unknown'}</div>
                </div>
              </div>
            ))}
            {connectedClients.length === 0 && (
              <div className="col-span-full text-gray-400 text-center py-8 text-xl">
                No clients connected
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gray-800 border-gray-600">
        <CardHeader>
          <CardTitle className="text-3xl text-white mb-4">Debug Log</CardTitle>
          <div className="flex gap-4 flex-wrap">
            <Button
              variant={debugFilter === 'ALL' ? 'default' : 'outline'}
              onClick={() => setDebugFilter('ALL')}
              className="text-lg h-12 px-6 text-white bg-gray-700 hover:bg-gray-600"
            >
              All ({debugLog.length})
            </Button>
            <Button
              variant={debugFilter === 'UI' ? 'default' : 'outline'}
              onClick={() => setDebugFilter('UI')}
              className="text-lg h-12 px-6 text-white bg-gray-700 hover:bg-gray-600"
            >
              UI ({debugLog.filter(e => e.source === 'UI').length})
            </Button>
            <Button
              variant={debugFilter === 'API' ? 'default' : 'outline'}
              onClick={() => setDebugFilter('API')}
              className="text-lg h-12 px-6 text-white bg-gray-700 hover:bg-gray-600"
            >
              API ({debugLog.filter(e => e.source === 'API').length})
            </Button>
            <Button
              variant={debugFilter === 'WEBSOCKET' ? 'default' : 'outline'}
              onClick={() => setDebugFilter('WEBSOCKET')}
              className="text-lg h-12 px-6 text-white bg-gray-700 hover:bg-gray-600"
            >
              WebSocket ({debugLog.filter(e => e.source === 'WEBSOCKET').length})
            </Button>
            <Button
              variant="outline"
              onClick={handleDownloadCSV}
              className="text-lg h-12 px-6 text-white bg-blue-600 hover:bg-blue-700"
            >
              <Download className="w-5 h-5 mr-2" />
              Download CSV
            </Button>
            <Button
              variant="outline"
              onClick={onClearDebugLog}
              className="text-lg h-12 px-6 text-white bg-red-600 hover:bg-red-700"
            >
              Clear Log
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-h-[75vh] overflow-y-auto space-y-3">
            {filteredDebugLog.map((entry, index) => (
              <div key={index} className="bg-gray-700 p-4 rounded-xl text-lg border border-gray-600">
                <div className="flex items-center gap-4 mb-3">
                  <span className="text-gray-300 text-lg font-mono">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={`px-3 py-1 rounded text-lg font-bold ${
                    entry.source === 'UI' ? 'bg-blue-600 text-white' :
                    entry.source === 'API' ? 'bg-green-600 text-white' :
                    'bg-purple-600 text-white'
                  }`}>
                    {entry.source}
                  </span>
                  <span className="text-white font-semibold text-lg">{entry.action}</span>
                </div>
                {entry.details && (
                  <pre className="text-gray-300 text-base overflow-x-auto bg-gray-800 p-3 rounded-lg border">
                    {JSON.stringify(entry.details, null, 2)}
                  </pre>
                )}
              </div>
            ))}
            {filteredDebugLog.length === 0 && (
              <div className="text-gray-400 text-center py-12 text-2xl">
                No debug entries found for "{debugFilter}" filter
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DebugTab;
