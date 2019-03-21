import React from 'react';
import { Segment } from 'semantic-ui-react'
import { Route } from 'react-router-dom'
import Projects from '../components/Projects'
import Contact from '../components/Contact'
import Home from '../components/Home'

const Banner = ({resumeHovered, handleResumeLeave,handleResumeEnter, firstName, lastName, email, comments, handleSubmit, handleFormText}) => (
  <Segment padded='very' style={{height:'92vh', marginTop: '0', backgroundColor: '#3F5866', borderRadius: '0', boxShadow: '4px 3px 4px #888888', overflow: 'scroll'}}>
      <Route
        path='/projects/'
        render={() => <Projects/>}
      />
      <Route
        exact path='/contact'
        render={() => <Contact firstName={firstName} lastName={lastName} email={email} comments={comments} handleSubmit={handleSubmit} handleFormText={handleFormText}/>}
      />
      <Route
        exact path='/'
        render={() =><Home resumeHovered={resumeHovered} handleResumeLeave={handleResumeLeave} handleResumeEnter={handleResumeEnter}/>}
      />
  </Segment>
);

export default Banner;
