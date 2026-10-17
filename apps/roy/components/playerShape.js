import React from 'react';
import { View, StyleSheet } from 'react-native';

const PlayerShape = ({ currentPlayer }) => {
  const isPlayer1 = currentPlayer === 1;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={[styles.box, isPlayer1 ? styles.yellowBox : styles.blueBox]} />
        <View style={[styles.box, styles.redBox]} />
        <View style={[styles.box, styles.redBox]} />
      </View>
      <View style={styles.row}>
        <View style={[styles.box, isPlayer1 ? styles.yellowBox : styles.blueBox]} />
        <View style={[styles.box, isPlayer1 ? styles.orangeBox : styles.purpleBox]} />
        <View style={[styles.box, styles.redBox]} />
      </View>
      <View style={styles.row}>
      <View style={[styles.box, isPlayer1 ? styles.yellowBox : styles.blueBox]} />
      <View style={[styles.box, isPlayer1 ? styles.yellowBox : styles.blueBox]} />
        <View style={[styles.box, styles.redBox]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
    padding:5,
  },
  row: {
    flexDirection: 'row',
  },
  box: {
    width: 7,
    height: 7,
    borderWidth: 1, // Add border to each box
    borderColor: 'black', // Border color
  },
  yellowBox: {
    backgroundColor: 'yellow',
  },
  redBox: {
    backgroundColor: 'red',
  },
  orangeBox: {
    backgroundColor: 'orange',
  },
  blueBox: {
    backgroundColor: 'blue',
  },
  purpleBox: {
    backgroundColor: 'purple',
  },
});

export default PlayerShape;
