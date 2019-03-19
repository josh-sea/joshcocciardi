import React, { Component } from 'react';
import { BrowserRouter as Router, Route } from 'react-router-dom'
import HeaderBar from './Containers/HeaderBar'
import Banner from './Containers/Banner'

class App extends Component {

  render() {
    return (
      <Router>
        <HeaderBar />
        <Banner />
      </Router>
    );
  }
}

export default App;
