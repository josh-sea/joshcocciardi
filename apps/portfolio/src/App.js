import React from "react";
import { Menu, Container, Segment } from "semantic-ui-react";
import { BrowserRouter as Router, Route, Routes, Link, Outlet, Navigate } from "react-router-dom";
import About from "./components/about";
import Projects from "./components/projects";
import Contact from "./components/contact";
import HulkGame from "./components/HulkGame";
import DoomLifeGame from "./components/DoomLifeGame";
import ExpenseAnalyzer from "./components/ExpenseAnalyzer";
import ToolsIndex from "./tools/ToolsIndex";
import ToolPage from "./tools/ToolPage";
import WorkPage from "./work/WorkPage";
import "./App.css";

// Standard site chrome: sticky nav + centered content container.
// Tool pages (/tools/:slug) render outside this layout, full-bleed,
// so each tool controls its own page styling.
const SiteLayout = () => (
  <div className="app-container">
    <Segment basic className="sticky-nav">
      <Container>
        <Menu pointing secondary>
          <Menu.Item as={Link} to="/" name="About" />
          <Menu.Item as={Link} to="/projects" name="Projects" />
          <Menu.Item as={Link} to="/contact" name="Contact" />
        </Menu>
      </Container>
    </Segment>
    <Container className="main-content">
      <Outlet />
    </Container>
  </div>
);

const App = () => {
  return (
    <Router>
      <Routes>
        <Route element={<SiteLayout />}>
          <Route path="/" element={<About />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/hulk-game" element={<HulkGame />} />
          <Route path="/doom-life-game" element={<DoomLifeGame />} />
          <Route path="/expense-analyzer" element={<ExpenseAnalyzer />} />
          <Route path="/tools" element={<ToolsIndex />} />
        </Route>
        <Route path="/tools/:slug" element={<ToolPage />} />
        {/* Private pages: full-bleed, behind the /work allowlist, and absent
            from every index on the site. `/work` itself has no listing — the
            bare path falls through to the same "not found" as a bad slug. */}
        <Route path="/work" element={<WorkPage />} />
        <Route path="/work/:slug" element={<WorkPage />} />
        {/* short vanity path for the Hit Field analyzer */}
        <Route path="/analyzer" element={<Navigate to="/tools/analyzer" replace />} />
      </Routes>
    </Router>
  );
};

export default App;
