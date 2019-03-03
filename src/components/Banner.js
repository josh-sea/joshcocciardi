import React from 'react';
import { Button } from 'semantic-ui-react'

const Banner = ({}) => (
  <div style={style}>
    <div className='container'>
      <div className='jumbotron'>
        <a href='https://www.google.com' target='_blank'><Button>GOOGLE</Button></a>
      </div>
    </div>
  </div>
);

export default Banner;

const style = {
  background: '#4AF8FF',
  width: '100%',
  paddingRight: '5%',
  paddingLeft: '5%',
  paddingBottom: '5%'
}
