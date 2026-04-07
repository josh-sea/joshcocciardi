import React from 'react';
import { Container, Header, List } from 'semantic-ui-react';

const Contact = () => (
  <Container text style={{ overflow: 'auto', height: '100vh' }}>
    <Header as="h1">Contact</Header>
    <List bulleted>
      <List.Item>Josh Cocciardi</List.Item>
      <List.Item>Phone: (845) 392-1971</List.Item>
      <List.Item>Email: joshua.cocciardi@gmail.com</List.Item>
      <List.Item>
        LinkedIn: <a href="https://www.linkedin.com/in/joshcocciardi">linkedin.com/in/joshcocciardi</a>
      </List.Item>
    </List>
  </Container>
);

export default Contact;