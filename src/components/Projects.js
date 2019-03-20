import React from 'react';
import { Header, Button, Modal, Segment, Card } from 'semantic-ui-react'
import Iframe from 'react-iframe'
import { Link, Route } from 'react-router-dom'



const Projects = ({}) => (


  <Segment padded='very' style={{height:'100%', backgroundColor: '#F0F0DF',overflow:'scroll'}}>

  <Card.Group>
  <Card style={{margin:'5%'}}>
      <Card.Content>
      <Card.Header>Knowtr</Card.Header>
      <Card.Meta>
        <span className='date'>Classroom based note taking app</span>
      </Card.Meta>
      <Card.Description>Knowtr is powered by REACT/RAILS and facilitates live note taking in a classroom environment. Using ActionCable allows users to edit rich text notes and see what their classmates are working on in real time.</Card.Description>
    </Card.Content>
    <Card.Content extra>
    <Modal trigger={<Link to='/projects/knowtr'><Button fluid>Knowtr Demo</Button></Link>} basic size='fullscreen' closeIcon>
      <Header icon='file alternate' content='Knowtr Note Taking App' />
      <Modal.Content style={{marginLeft: '3%'}}>
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
    <Card.Meta>
      <span className='date'>App is hosted on Heroku and may take up to 30 seconds to wake the server</span>
    </Card.Meta>
    </Card.Content>
  </Card>

  <Card style={{margin:'5%'}}>
    <Card.Content>
      <Card.Header>CSStyle</Card.Header>
      <Card.Meta>
        <span className='date'>A community for sharing stylesheets</span>
      </Card.Meta>
      <Card.Description>CSStyle is powered by REACT/RAILS and gives user the opportunity to share HTML/CSS/Javascript snippets with the community. Snippets can be viewed by all and edited by teir owners. Users can also download stylesheets at the time of viewing or get a link to a stylesheet as a referenece for use in future projects.</Card.Description>
    </Card.Content>
    <Card.Content extra>
    <Modal style={align} trigger={<Link to='/projects/csstyle'><Button fluid>CSStyle Demo</Button></Link>} basic size='fullscreen' closeIcon>
      <Header content='CSStyle, an app to share style sheets with the world' />
      <Modal.Content style={{marginLeft: '3%'}}>
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
    <Card.Meta>
      <span className='date'>App is hosted on Heroku and may take up to 30 seconds to wake the server</span>
    </Card.Meta>
    </Card.Content>
  </Card>

  <Card style={{margin:'5%'}}>
      <Card.Content>
      <Card.Header>GitHub</Card.Header>
      <Card.Meta>
        <span className='date'>My github profile</span>
      </Card.Meta>
      <Card.Description>More projects to come. In the meantime feel free to look at my repositories to see what I am working on</Card.Description>
    </Card.Content>
    <Card.Content extra>
    <Button fluid style={{marginBottom: '15%'}}> <a href='https://github.com/josh-sea' target='_blank' rel="noopener noreferrer"> GitHub </a></Button>
    </Card.Content>
  </Card>

  </Card.Group>
  </Segment>
);

export default Projects;

const align = {
  alignItems: 'center',
  justifyContent: 'center',
  display: 'flex'
}
