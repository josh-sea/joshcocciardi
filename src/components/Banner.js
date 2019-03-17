import React from 'react';
import { Button } from 'semantic-ui-react'
import { BrowserRouter as Router, Route } from 'react-router-dom'
import Projects from './Projects'
import Contact from './Contact'

const Banner = ({}) => (
  <div style={style}>
    <div className='container'>
      <div className='jumbotron' style={{height: '80vh'}}>
      <Route
        path='/projects/'
        render={() => <Projects/>}
      />
      <Route
        exact path='/contact'
        render={() => <Contact/>}
      />
      </div>
    </div>
  </div>
);

export default Banner;

const style = {
  background: '#4AF8FF',
  width: '100%',
  paddingRight: '5%',
  paddingLeft: '5%',
  paddingBottom: '5%'
}
