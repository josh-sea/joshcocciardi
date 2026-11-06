import React from "react";
import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import Layout from "./site/Layout";
import Home from "./site/Home";
import Projects from "./site/Projects";
import Contact from "./site/Contact";
import NotFound from "./site/NotFound";
import DoomLifeGame from "./components/DoomLifeGame";
import ExpenseAnalyzer from "./components/ExpenseAnalyzer";
import ToolsIndex from "./tools/ToolsIndex";
import ToolPage from "./tools/ToolPage";
import WorkPage from "./work/WorkPage";
import { toolForHost } from "./site/domains";
import "./App.css";

// Routes inside <Layout> get the site header and footer. Tool pages
// (/tools/:slug) and private /work pages render full-bleed so each one
// controls its own page.
//
// Everything under /projects/<name> is a separately built static app served
// straight by Firebase Hosting, so those never reach this router.
const MainSite = () => (
  <Router>
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/tools" element={<ToolsIndex />} />
        <Route path="/doom-life-game" element={<DoomLifeGame />} />
        <Route path="/expense-analyzer" element={<ExpenseAnalyzer />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route path="/tools/:slug" element={<ToolPage />} />

      {/* Private pages: full-bleed, behind the /work allowlist, and absent
          from every index on the site. `/work` itself has no listing; the
          bare path falls through to the same "not found" as a bad slug. */}
      <Route path="/work" element={<WorkPage />} />
      <Route path="/work/:slug" element={<WorkPage />} />

      {/* Short paths */}
      <Route path="/about" element={<Navigate to="/" replace />} />
      <Route path="/analyzer" element={<Navigate to="/tools/analyzer" replace />} />
    </Routes>
  </Router>
);

// Served from a tool's own subdomain (mise.joshcocciardi.com, or its web.app
// site): that one tool is the whole site, at every path.
const ToolSite = ({ slug }) => (
  <Router>
    <Routes>
      <Route path="*" element={<ToolPage slug={slug} />} />
    </Routes>
  </Router>
);

const hostTool = toolForHost();

const App = () => (hostTool ? <ToolSite slug={hostTool} /> : <MainSite />);

export default App;
