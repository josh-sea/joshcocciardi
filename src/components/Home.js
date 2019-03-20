import React from 'react';
import { Segment, Header, Card, Image } from 'semantic-ui-react'


const Home = ({}) => (
      <Segment>
        <Card>
        <Image src='JoshCocciardi.jpg' size='medium' circular />
    <Card.Content>
      <Card.Header>Josh Cocciardi</Card.Header>
      <Card.Meta>
        <span className='date'>Full Stack Web Developer, Mechanical Engineer</span>
      </Card.Meta>
      <Card.Description>I live in the NYC Metro Area and am looking for a role as a software developer</Card.Description>
    </Card.Content>
    </Card>
        <Header as='h4'>

        </Header>
      </Segment>
);

export default Home;
