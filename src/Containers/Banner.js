import React from 'react';
import { Button, Segment } from 'semantic-ui-react'
import { BrowserRouter as Router, Route } from 'react-router-dom'
import Projects from '../components/Projects'
import Contact from '../components/Contact'
import Home from '../components/Home'

const Banner = ({}) => (
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
        render={() =><Home />}
      />
  </Segment>
);

export default Banner;

const style = {
  background: '#4AF8FF',
  width: '100%',
  paddingRight: '5%',
  paddingLeft: '5%',
  paddingBottom: '5%'
}
