import React, { Component } from 'react';
import { BrowserRouter as Router, Route } from 'react-router-dom'
import HeaderBar from './components/HeaderBar'
import Banner from './components/Banner'

class App extends Component {

  render() {
    return (
      <Router>
      <div>
        <HeaderBar />
        <Banner />

      </div>
      </Router>
    );
  }
}

export default App;
