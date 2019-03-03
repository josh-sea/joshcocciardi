import React, { Component } from 'react';
import logo from './logo.svg';
import './App.css';
import Header from './components/Header'
import Banner from './components/Banner'

class App extends Component {

  render() {
    return (
      <div>
        <Header />
        <Banner />
      </div>
    );
  }
}

export default App;
