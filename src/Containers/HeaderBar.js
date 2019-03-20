import React from 'react';
import { Menu, Dropdown, Header } from 'semantic-ui-react'
import { Link } from 'react-router-dom'


const HeaderBar = ({}) => (
    <Menu attached='top' inverted style={{marginBottom: '0', borderRadius:'0', backgroundColor: '#2B3A42', padding:'15px'}}>
      <Dropdown item icon='bars' simple>
        <Dropdown.Menu style={{backgroundColor: '#2B3A42', borderRadius: '5px', width: '15vw'}}>
          <Dropdown.Item >
            <Link to='/'><Header as='h3' style={font}>Home</Header></Link>
          </Dropdown.Item>
        <Dropdown.Divider />
          <Dropdown.Item>
            <Link to='/projects/'><Header as='h3' style={font}>Projects</Header></Link>
          </Dropdown.Item>
        <Dropdown.Divider />
          <Dropdown.Item>
            <Link to='/contact'><Header as='h3' style={font}>Contact</Header></Link>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown>
    </Menu>
);

export default HeaderBar;

const font = {
  color:'#BDD3DE'
}
