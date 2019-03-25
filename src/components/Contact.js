import React from 'react';
import { Header, Container, Form, Button, Segment, List } from 'semantic-ui-react'
import Iframe from 'react-iframe'

const Contact = ({firstName, lastName, email, comments, handleSubmit, handleFormText}) => (
  <Container style={{height:'50vh'}}>
    <Segment style={{minWidth: '600px'}}>
      <Header as='h3' style={align}>Contact Me</Header>
      <div style={{display: 'flex'}}>
        <Form style={{marginLeft: '15%', marginTop: '2%', marginRight: '3%', width: '50%', maxWidth: '500px'}} onSubmit={handleSubmit}>
          <Form.Field>
            <label>First Name</label>
            <input id='firstName' onChange={handleFormText} placeholder='First Name' value={firstName}/>
          </Form.Field>
          <Form.Field>
            <label>Last Name</label>
            <input id='lastName'  onChange={handleFormText} placeholder='Last Name' value={lastName}/>
          </Form.Field>
          <Form.Field>
            <label>Email</label>
            <input id='email'  onChange={handleFormText} type='email' placeholder='Email' value={email}/>
          </Form.Field>
          <Form.TextArea id='comments'  onChange={handleFormText} label='Comment/Quesion' placeholder="What's up?" value={comments}/>
          <Button type='submit'>Submit</Button>
        </Form>
        <div style={{width: '50%', marginRight: '5%', padding:'5%'}}>
          <List style={{marginBottom: '10%'}}>
            <List.Item>
              <List.Icon name='user' />
              <List.Content>Joshua Cocciardi</List.Content>
            </List.Item>
            <List.Item>
              <List.Icon name='marker' />
              <List.Content>Katonah, New York</List.Content>
            </List.Item>
            <List.Item>
              <List.Icon name='mail' />
              <List.Content>
                <a href='mailto:jack@semantic-ui.com'>joshua.cocciardi@gmail.com</a>
              </List.Content>
            </List.Item>
            <List.Item>
              <List.Icon name='phone' />
              <List.Content>
                <a href='tel:845-392-1971'>845-392-1971</a>
              </List.Content>
            </List.Item>
            <List.Item>
              <List.Icon name='linkedin' />
              <List.Content>
                <a href='https://www.linkedin.com/in/joshuacocciardi/' target='_blank' rel="noopener noreferrer" >LinkedIn</a>
              </List.Content>
            </List.Item>
            <List.Item>
              <List.Icon name='github' />
              <List.Content>
                <a href='https://github.com/josh-sea' target='_blank' rel="noopener noreferrer"> GitHub </a>
              </List.Content>
            </List.Item>
          </List>
          <Iframe url={'https://www.google.com/maps/embed?pb=!1m10!1m8!1m3!1d7279.141778752608!2d-73.68194985974586!3d41.257717223303366!3m2!1i1024!2i768!4f13.1!5e0!3m2!1sen!2sus!4v1553193199623'}
                  width="200"
                  height="150"
                  frameborder="0"
                  style={{border:'0'}}
                  id="myId"
                  className="myClassname"
                  display="initial"
                  position="relative"
                  allowFullScreen>
          </Iframe>
        </div>
      </div>
    </Segment>
  </Container>
);

export default Contact;

const align = {
  alignItems: 'center',
  justifyContent: 'center',
  display: 'flex'
}
