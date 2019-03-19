import React from 'react';
import { Header, Button, Icon, Modal, Segment } from 'semantic-ui-react'
import Iframe from 'react-iframe'
import { Link, Route } from 'react-router-dom'

const Projects = ({}) => (

  <Segment padded='very' style={{height:'100%', backgroundColor: '#F0F0DF'}}>
  <Header as='h3' style={align}>Project Page</Header>
  <Modal trigger={<Link to='/projects/knowtr'><Button as='h3'>Knowtr</Button></Link>} basic centered={true} size='fullscreen' closeIcon>
    <Header icon='file alternate' content='Knowtr Note Taking App' />
    <Modal.Content style={{marginLeft: '5%'}}>
    <Route
      exact path='/projects/knowtr'
      render={() =>{
      return  <Iframe url={'https://knowtr.herokuapp.com/'}
              width="100%"
              height="80vh"
              id="myId"
              className="myClassname"
              display="initial"
              position="relative"
              allowFullScreen>
            </Iframe>
      }}
    />
    </Modal.Content>
  </Modal>

  <Modal trigger={    <Link to='/projects/csstyle'><Button>CSStyle</Button></Link>} basic size='fullscreen' closeIcon>
    <Header content='CSStyle, an app to share style sheets with the world' />
    <Modal.Content style={{marginLeft: '5%'}}>
    <Route
      exact path='/projects/csstyle'
      render={() =>{
      return  <Iframe
              url={'https://csstyle.herokuapp.com/'}
              width="100%"
              height="80vh"
              id="myId"
              className="myClassname"
              display="initial"
              position="relative"
              allowFullScreen
              style={align}
              >
            </Iframe>
      }}
    />
    </Modal.Content>
  </Modal>
  </Segment>
);

export default Projects;

const align = {
  alignItems: 'center',
  justifyContent: 'center',
  display: 'flex'
}
