import React from "react";
import { Menu, Container, Segment } from "semantic-ui-react";
import { BrowserRouter as Router, Route, Routes, Link } from "react-router-dom";
import About from "./components/about";
import Projects from "./components/projects";
import Contact from "./components/contact";
import HulkGame from "./components/HulkGame";
import DoomLifeGame from "./components/DoomLifeGame";
import ExpenseAnalyzer from "./components/ExpenseAnalyzer";
import "./App.css";

const App = () => {
  return (
    <Router>
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
          <Routes>
            <Route path="/" element={<About />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/hulk-game" element={<HulkGame />} />
            <Route path="/doom-life-game" element={<DoomLifeGame />} />
            <Route path="/expense-analyzer" element={<ExpenseAnalyzer />} />
          </Routes>
        </Container>
      </div>
    </Router>
  );
};

export default App;
