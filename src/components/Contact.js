import React from 'react';
import { Header, Container, Form, Button, Segment, List, Icon } from 'semantic-ui-react'
import Iframe from 'react-iframe'

const Contact = ({firstName, lastName, email, comments, handleSubmit, handleFormText}) => (
  <Container style={{height:'50vh'}}>
    <Segment>
      <Header as='h3' style={align}>Contact Me</Header>
      <div style={{display: 'flex'}}>
        <Form style={{margin: '5%', width: '50%', maxWidth: '500px'}} onSubmit={handleSubmit}>
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
        <div style={{width: '50%', marginRight: '5%', marginTop: '5%', padding:'5%'}}>
          <List>
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
              <List.Icon name='linkify' />
              <List.Content>
                <a href='www.joshcocciardi.com'>joshcocciardi.com</a>
              </List.Content>
            </List.Item>
            <List.Item>
              <List.Icon name='github' />
              <List.Content>
                <a href='https://github.com/josh-sea'>GitHub</a>
              </List.Content>
            </List.Item>
          </List>
          </div>

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

    </Segment>
  </Container>
);

export default Contact;

const align = {
  alignItems: 'center',
  justifyContent: 'center',
  display: 'flex'
}
