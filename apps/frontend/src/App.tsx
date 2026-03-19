import { Routes, Route, Navigate } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import BlueprintsPage from './pages/BlueprintsPage';
import PromptsPage from './pages/PromptsPage';
import SummariesPage from './pages/SummariesPage';
import AuditLogPage from './pages/AuditLogPage';
import ShellLayout from './components/ShellLayout';
import CodexPage from './pages/CodexPage';
import CodexModelsPage from './pages/CodexModelsPage';
import CodexRequestDetailPage from './pages/CodexRequestDetailPage';
import EnvironmentsPage from './pages/EnvironmentsPage';
import LogInterpreterPage from './pages/LogInterpreterPage';
import PromptHintsPage from './pages/PromptHintsPage';
import ProblemsPage from './pages/ProblemsPage';
import ProblemDetailPage from './pages/ProblemDetailPage';

function App() {
  return (
    <ShellLayout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/blueprints" element={<BlueprintsPage />} />
        <Route path="/prompts" element={<PromptsPage />} />
        <Route path="/prompt-hints" element={<PromptHintsPage />} />
        <Route path="/problems" element={<ProblemsPage />} />
        <Route path="/problems/:id" element={<ProblemDetailPage />} />
        <Route path="/environments" element={<EnvironmentsPage />} />
        <Route path="/logs" element={<LogInterpreterPage />} />
        <Route path="/codex" element={<CodexPage />} />
        <Route path="/codex/requests/:id" element={<CodexRequestDetailPage />} />
        <Route path="/codex/models" element={<CodexModelsPage />} />
        <Route path="/summaries" element={<SummariesPage />} />
        <Route path="/audit" element={<AuditLogPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ShellLayout>
  );
}

export default App;
