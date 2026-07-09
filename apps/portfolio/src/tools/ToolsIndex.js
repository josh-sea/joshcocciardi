import React from "react";
import { Link } from "react-router-dom";
import { Container, Header, Card } from "semantic-ui-react";
import tools from "./registry";

// Directory of all registered React tools.
const ToolsIndex = () => (
  <Container style={{ paddingTop: 20, paddingBottom: 40 }}>
    <Header as="h1">Tools</Header>
    <p>Small interactive tools and visualizations.</p>
    <Card.Group>
      {tools.map((t) => (
        <Card key={t.slug} as={Link} to={`/tools/${t.slug}`}>
          <Card.Content>
            <Card.Header>{t.title}</Card.Header>
            <Card.Meta>{t.added}</Card.Meta>
            <Card.Description>{t.description}</Card.Description>
          </Card.Content>
        </Card>
      ))}
    </Card.Group>
  </Container>
);

export default ToolsIndex;
