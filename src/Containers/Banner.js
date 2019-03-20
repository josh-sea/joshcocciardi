import React from 'react';
import { Segment } from 'semantic-ui-react'
import { Route } from 'react-router-dom'
import Projects from '../components/Projects'
import Contact from '../components/Contact'
import Home from '../components/Home'

const Banner = ({resumeHovered, handleResumeLeave,handleResumeEnter}) => (
  <Segment padded='very' style={{height:'95vh', marginTop: '0', backgroundColor: '#3F5866', borderRadius: '0'}}>
      <Route
        path='/projects/'
        render={() => <Projects/>}
      />
      <Route
        exact path='/contact'
        render={() => <Contact/>}
      />
      <Route
        exact path='/'
        render={() =><Home resumeHovered={resumeHovered} handleResumeLeave={handleResumeLeave} handleResumeEnter={handleResumeEnter}/>}
      />
  </Segment>
);

export default Banner;
