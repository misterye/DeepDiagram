import './App.css';
import { ChatPanel } from './components/ChatPanel';
import { CanvasPanel } from './components/CanvasPanel';
import { PasswordGate } from './components/PasswordGate';
import { ReactFlowProvider } from 'reactflow';
import { Panel, Group, Separator } from 'react-resizable-panels';

function App() {
  return (
    <PasswordGate>
      <div className="h-screen w-screen overflow-hidden">
        <Group orientation="horizontal" className="h-full w-full">
          <Panel defaultSize={65} minSize={30}>
            <div className="h-full w-full relative">
              <ReactFlowProvider>
                <CanvasPanel />
              </ReactFlowProvider>
            </div>
          </Panel>

          <Separator className="w-1.5 hover:w-2 bg-slate-200 hover:bg-blue-400 transition-all flex items-center justify-center group relative z-50 cursor-col-resize">
            <div className="w-1 h-8 bg-slate-400 rounded-full group-hover:bg-white" />
            {/* Invisible larger hit area */}
            <div className="absolute inset-y-0 -left-2 -right-2 bg-transparent" />
          </Separator>

          <Panel defaultSize={35} minSize={20}>
            <ChatPanel />
          </Panel>
        </Group>
      </div>
    </PasswordGate>
  );
}

export default App;
