import React from 'react';
import { Header } from 'semantic-ui-react'
import Iframe from 'react-iframe'
import { Link, Route } from 'react-router-dom'

const Projects = ({}) => (
  <div style={{height:'100%'}}>
    <Header as='h3' style={align}>Project Page</Header>
    <Link to='/projects/knowtr'><Header as='h3'>Knowtr</Header></Link>
    <Link to='/projects/wiki'><Header as='h3'>Wiki</Header></Link>
    <Route
      exact path='/projects/knowtr'
      render={() =>{
      return  <Iframe url={'https://knowtr.herokuapp.com/'}
              width="100%"
              height="100%"
              id="myId"
              className="myClassname"
              display="initial"
              position="relative"
              allowFullScreen>
            </Iframe>
      }}
    />
    <Route
      exact path='/projects/wiki'
      render={() =>{
      return  <Iframe url={'https://wikipedia.org/'}
              width="100%"
              height="100%"
              id="myId"
              className="myClassname"
              display="initial"
              position="relative"
              allowFullScreen>
            </Iframe>
      }}
    />
  </div>
);

export default Projects;

const align = {
  alignItems: 'center',
  justifyContent: 'center',
  display: 'flex'
}
