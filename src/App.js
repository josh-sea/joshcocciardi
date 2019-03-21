import React, { Component } from 'react';
import { BrowserRouter as Router } from 'react-router-dom'
import HeaderBar from './Containers/HeaderBar'
import Banner from './Containers/Banner'


class App extends Component {
  state = {
    resumeHovered: false,
    firstName: '',
    lastName: '',
    email: '',
    comments: '',
  }

  handleResumeEnter = e => {
    this.setState({resumeHovered: true})
  }
  handleResumeLeave = e => {
    this.setState({resumeHovered: false})
  }

  handleSubmit = e => {
    e.preventDefault()
    this.setState({
        firstName: '',
        lastName: '',
        email: '',
        comments: ''
      })
    console.log(this.state);
  }

  handleFormText = e => {
    e.target.id==='firstName' && this.setState({firstName: e.target.value})
    e.target.id === 'lastName' && this.setState({lastName: e.target.value})
    e.target.id === 'email' && this.setState({email: e.target.value})
    e.target.id === 'comments' && this.setState({comments: e.target.value})

    console.log(e.target.value);
  }

  render() {
    return (
      <Router>
      <div style={{paddingLeft: '20px', paddingRight: '20px', paddingBottom: '20px', paddingTop: '3px', backgroundColor: '#F0F0DF', overflow: 'hidden'}}>
        <HeaderBar />
        <Banner
          resumeHovered={this.state.resumeHovered}
          handleResumeEnter={this.handleResumeEnter}
          handleResumeLeave={this.handleResumeLeave}
          firstName={this.state.firstName}
          lastName={this.state.lastName}
          email={this.state.email}
          comments={this.state.comments}
          handleSubmit={this.handleSubmit}
          handleFormText={this.handleFormText}
        />
      </div>
      </Router>
    );
  }
}

export default App;
