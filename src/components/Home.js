import React from 'react';
import { Segment, Header, Card, Image, Button, Modal } from 'semantic-ui-react'

const Home = ({resumeHovered, handleResumeEnter, handleResumeLeave}) => (
      <Segment>
        <Card.Group>
          <Card>
            <Image src='JoshandAmelia.jpeg' size='medium' circular />
            <Card.Content>
              <Card.Header>Josh Cocciardi</Card.Header>
              <Card.Meta>
                <span className='date'>Full Stack Web Developer, Mechanical Engineer</span>
              </Card.Meta>
              <Card.Description>I live in the NYC Metro Area and am looking for a role as a software developer</Card.Description>
            </Card.Content>
          </Card>
          <Segment>
            <div onMouseEnter={handleResumeEnter} onMouseLeave={handleResumeLeave} style={{height: '30vh', width: '15vw', boxShadow: resumeHovered ? '4px 3px 4px #888888' : '8px 6px 8px #888888'}}>
              <Modal trigger={<Image style={{height:'100%',width:'100%'}} src="JoshCocciardi_Resume.jpg" />} basic size='fullscreen'>
                <Modal.Content style={{marginLeft: '3%'}}>
                  <Image src="JoshCocciardi_Resume.jpg" />
                </Modal.Content>
              </Modal>
            </div>
            <a href="JoshCocciardi_Resume.pdf" target='_blank' rel="noopener noreferrer"><Button style={{marginTop: '3%', marginLeft: '25%'}}>Download</Button></a>
          </Segment>
          </Card.Group>
      </Segment>
);

export default Home;
