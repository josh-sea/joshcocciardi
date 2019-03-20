import React, { Component } from 'react';
import { BrowserRouter as Router } from 'react-router-dom'
import HeaderBar from './Containers/HeaderBar'
import Banner from './Containers/Banner'


class App extends Component {
  state = {
    resumeHovered: false,
  }

  handleResumeEnter = e => {
    this.setState({resumeHovered: true})
  }
  handleResumeLeave = e => {
    this.setState({resumeHovered: false})
  }

  render() {
    return (
      <Router>
        <HeaderBar />
        <Banner resumeHovered={this.state.resumeHovered} handleResumeEnter={this.handleResumeEnter} handleResumeLeave={this.handleResumeLeave}/>
      </Router>
    );
  }
}

export default App;
