import React from 'react';
import { Icon, Menu, Dropdown, Button, Header } from 'semantic-ui-react'
import { Link } from 'react-router-dom'


const HeaderBar = ({}) => (

  <div style={style}>
  <Menu attached='top'>
    <Dropdown item icon='bars' simple>
      <Dropdown.Menu>
        <Dropdown.Item style={{display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
          <Link to='/'><Header as='h3'>Home</Header></Link>
        </Dropdown.Item>
      <Dropdown.Divider />
        <Dropdown.Item>
          <Link to='/projects/'><Header as='h3'>Projects</Header></Link>
        </Dropdown.Item>
      <Dropdown.Divider />
        <Dropdown.Item>
          <Link to='/contact'><Header as='h3'>Contact</Header></Link>
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  </Menu>
  </div>
);

export default HeaderBar;

const style = {
  background: '#60487F',
  height: '10vh',
  width: '100%'
}
