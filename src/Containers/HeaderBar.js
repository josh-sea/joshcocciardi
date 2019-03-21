import React from 'react';
import { Menu, Dropdown, Header } from 'semantic-ui-react'
import { Link } from 'react-router-dom'


const HeaderBar = () => (
  <div >
    <Menu attached='top' inverted style={{borderRadius:'0', backgroundColor: '#2B3A42', padding:'15px', borderTopLeftRadius: '10px', borderTopRightRadius: '10px', borderBottomLeftRadius: '2px', borderBottomRightRadius: '2px', boxShadow: '4px 3px 4px #888888'}}>
      <Dropdown icon='bars' simple style={{midWidth: '200px', margin: '1px'}}>
        <Dropdown.Menu style={{backgroundColor: '#2B3A42', width: '15vw'}}>
          <Dropdown.Item >
            <Link to='/' style={{midWidth: '200px'}}><Header as='h3' style={font}>Home</Header></Link>
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
    <div style={{width:'100%', height: '2px', backgroundColor: '#BDD3DE', boxShadow: '2px 3px 4px #888'}}>
    </div>
  </div>
);

export default HeaderBar;

const font = {
  color:'#BDD3DE'
}
