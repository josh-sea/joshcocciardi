import React, { Component } from 'react';
import { BrowserRouter as Router } from 'react-router-dom'
import HeaderBar from './Containers/HeaderBar'
import Banner from './Containers/Banner'

//#########################################################################
//toggle urls for local or heroku deployment
// const BASEURL =  `http://localhost:3000/api/v1/messages`
const BASEURL =  `https://joshcocciardi-backend.herokuapp.com/api/v1/messages`
//#########################################################################


class App extends Component {
  state = {
    resumeHovered: false,
    firstName: '',
    lastName: '',
    email: '',
    comments: '',
  }


//#########################################################################
//methods for handling hover feature of resume thumbnail on homepage

  handleResumeEnter = e => {
    this.setState({resumeHovered: true})
  }
  handleResumeLeave = e => {
    this.setState({resumeHovered: false})
  }
//#########################################################################
//#########################################################################
//post request to backend to post new contact info and message from from using controlled form inputs

  handleSubmit = e => {
    e.preventDefault()
    fetch(`${BASEURL}`, {
      method: 'POST',
      headers:
      {
        "Content-Type": 'application/json',
        "Accept": 'application/json'
      },
      body: JSON.stringify({
        firstname: this.state.firstName,
        lastname: this.state.lastName,
        email: this.state.email,
        comment: this.state.comments
      })
    })
    .then(
      this.setState({
        firstName: '',
        lastName: '',
        email: '',
        comments: ''
      })
    )
    alert('Message Successfully Sent')
  }
//#########################################################################
//#########################################################################
//updated state based on form changes

  handleFormText = e => {
    e.target.id==='firstName' && this.setState({firstName: e.target.value})
    e.target.id === 'lastName' && this.setState({lastName: e.target.value})
    e.target.id === 'email' && this.setState({email: e.target.value})
    e.target.id === 'comments' && this.setState({comments: e.target.value})
  }
//#########################################################################
  render() {
    return (
      <Router>
      <div style={appStyle}>
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

//#########################################################################
//css styling for app container
const appStyle = {
  paddingLeft: '20px',
  paddingRight: '20px',
  paddingBottom: '20px',
  paddingTop: '3px',
  backgroundColor: '#F0F0DF',
  overflow: 'hidden'
}
