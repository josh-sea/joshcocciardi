import React from 'react';
import { Segment, Card, Image, Button, Modal, List, Icon, Container } from 'semantic-ui-react'
import { Link } from 'react-router-dom'


// <div style={{backgroundImage: 'url(JoshandAmelia.jpeg)', height: '50vh', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', backgroundSize: 'cover'}}>
// </div>

const Home = ({resumeHovered, handleResumeEnter, handleResumeLeave}) => (

      <Container className='home' style={{display: 'flex', padding: '10px', minWidth: '600px', maxWidth: '75vw'}}>
            <Card style={{marginBottom: '0', marginRight: '5px', minWidth: '100px'}}>
              <Image src='JoshandAmelia.jpeg' size='medium' circular />
              <Card.Content>
                <Card.Header>Josh Cocciardi</Card.Header>
                <Card.Meta>
                  <span className='date'>Full Stack Web Developer, Mechanical Engineer</span>
                </Card.Meta>
                <Card.Description>I live in the NYC Metro Area and am looking for a role as a software developer</Card.Description>
              </Card.Content>
            </Card>
          <Segment style={{marginTop: '0',marginLeft: '5px', minWidth: '500', textAlign:'center'}}>
            <h1 style={{color: '#2B3A42'}}>Hey there! </h1>
            <h3 style={{maxWidth: '800px'}}>I'm Josh, I am a full stack developer and mechanical engineer. I love creating new and exciting things. I look forward to working with amazing people and continuing to challenge myself.</h3>
            <Segment style={{display:'flex'}}>
              <div style={{width:'33%'}}>
                <h3> Some of my current tech stack</h3>
                <List style={{textAlign:'left'}}>
                  <List.Item>
                   <Icon color='yellow' name='js' />
                    Javascript
                   </List.Item>
                   <List.Item>
                     <Icon color='blue' loading name='react' />
                    React/Redux
                   </List.Item>
                   <List.Item>
                     <Icon color='red' name='gem' />
                     Ruby
                   </List.Item>
                   <List.Item>
                     <Icon color='red' name='gem outline' />
                     Ruby on Rails
                   </List.Item>
                   <List.Item>
                     <Icon color='orange' name='database' />
                     SQL/SQLite3/PostgreSQL
                   </List.Item>
                   <List.Item>
                     <Icon color='red' name='npm' />
                     npm
                   </List.Item>
                  <List.Item>
                    <Icon color='purple' name='h' />
                    Heroku
                  </List.Item>
                  <List.Item>
                    <Icon color='grey' name='github' />
                    GitHub/Git
                  </List.Item>
                </List>
                <h6> Check out my projects page to see what I am working</h6>
                <Link to='/projects/'><Button >Projects Page</Button></Link>
              </div>
              <div style={{width:'33%'}}>
                <h3>My Resume</h3>
                <div>
                  <div onMouseEnter={handleResumeEnter} onMouseLeave={handleResumeLeave} style={resumeHovered ? hoveredResume : resume}>
                    <Modal trigger={<Image style={{height:'100%',width:'auto', minWidth: '250px',overflow:'scroll'}} src="JoshCocciardi_Resume.jpg" />} basic size='fullscreen'>
                      <Modal.Content style={{marginLeft: '3%'}}>
                        <Image src="JoshCocciardi_Resume.jpg" />
                      </Modal.Content>
                    </Modal>
                  </div>
                  <a href="JoshCocciardi_Resume.pdf" target='_blank' rel="noopener noreferrer"><Button style={{marginTop: '3%'}}>Download</Button></a>
                </div>
              </div>
              <div style={{width:'33%'}}>
                <h3> Contact me </h3>
                <Link to='/contact/'><Button >Contact</Button></Link>
              </div>
            </Segment>
            <p>This page is powered by React.js, ReactRouter, Semantic UI React, Custom CSS</p>
          </Segment>
      </Container>
);

export default Home;

const resume = {
  height: '30vh',
  width: '15vw',
  minWidth: '250px',
  boxShadow: '8px 6px 8px #888888'
}

const hoveredResume = {
  height: '30vh',
  width: '15vw',
  minWidth: '250px',
  boxShadow: '4px 3px 4px #888888'
}
