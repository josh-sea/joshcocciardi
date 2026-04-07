import React from 'react';
import { Grid, Image, Header, Container, List, Segment } from 'semantic-ui-react';
import headshot from '../assets/josh_headshot.JPG'

const About = () => (
  <Container text style={{ padding: '2em 0', marginBottom: '2em' }}>
    <Grid stackable columns={2}>
      <Grid.Row>
        <Grid.Column>
          <Image src={headshot} size="large" rounded />
        </Grid.Column>
        <Grid.Column verticalAlign="middle">
          <Header as="h1" style={{ fontSize: '2.5em', marginBottom: '0.5em' }}>Josh Cocciardi</Header>
          <p style={{ fontSize: '1.2em', lineHeight: '1.6' }}>
            Integration Engineer at Riskified, making online buying safe through innovative fraud prevention solutions. 
            Based in the Greater NYC metro area, I specialize in integrating SaaS products into e-commerce checkout flows 
            and managing complex technical implementations.
          </p>
        </Grid.Column>
      </Grid.Row>

      <Grid.Row>
        <Grid.Column width={16}>
          <Segment raised style={{ marginTop: '2em' }}>
            <Header as="h3">Core Technical Stack</Header>
            <List bulleted horizontal style={{ gap: '1em' }}>
              <List.Item>JavaScript/React/Node</List.Item>
              <List.Item>Python/Django/Jupyter</List.Item>
              <List.Item>PostgreSQL</List.Item>
              <List.Item>Ruby/Rails</List.Item>
              <List.Item>Power Query/DAX/LookML</List.Item>
            </List>
          </Segment>

          <Segment raised style={{ marginTop: '2em' }}>
            <Header as="h3">Professional Experience</Header>
            
            <Header as="h4" style={{ color: '#2185d0' }}>Riskified | Integration Engineer</Header>
            <p style={{ lineHeight: '1.6' }}>
              Leading integration of SaaS products into e-commerce checkout flows, focusing on bespoke solutions 
              and data-driven analytics. Managing full integration lifecycle while serving as the primary liaison 
              between product teams, developers, and clients.
            </p>

            <Header as="h4" style={{ color: '#2185d0', marginTop: '1.5em' }}>Enertiv | Quality Assurance Engineer & BI Lead</Header>
            <p style={{ lineHeight: '1.6' }}>
              Led business intelligence initiatives and managed the migration to Microsoft Power BI. 
              Developed internal tools for hardware health monitoring and ESG product implementation. 
              Built and managed client-facing dashboards and internal analytics platforms.
            </p>
          </Segment>

          <Segment raised style={{ marginTop: '2em' }}>
            <Header as="h3">Education</Header>
            <List divided relaxed>
              <List.Item style={{ padding: '0.5em 0' }}>
                <List.Header style={{ color: '#2185d0', marginBottom: '0.3em' }}>Flatiron School</List.Header>
                Immersive Software Engineering Program
              </List.Item>
              <List.Item style={{ padding: '0.5em 0' }}>
                <List.Header style={{ color: '#2185d0', marginBottom: '0.3em' }}>University of Connecticut</List.Header>
                BSE, Mechanical Engineering with concentration in Energy and Power
              </List.Item>
            </List>
          </Segment>

          <Segment raised style={{ marginTop: '2em' }}>
            <Header as="h3">Current Projects</Header>
            <List divided relaxed>
              <List.Item style={{ padding: '0.5em 0' }}>
                <List.Header style={{ color: '#2185d0', marginBottom: '0.3em' }}>Fitbit Clock - Never Late</List.Header>
                A unique time management solution that randomizes displayed time to help users stay punctual
              </List.Item>
              <List.Item style={{ padding: '0.5em 0' }}>
                <List.Header style={{ color: '#2185d0', marginBottom: '0.3em' }}>Ragpal</List.Header>
                An AI Retrieval Augmented Generation (RAG) app using Python/Streamlit/LlamaIndex/Qdrant
              </List.Item>
            </List>
          </Segment>
        </Grid.Column>
      </Grid.Row>
    </Grid>
  </Container>
);

export default About;
