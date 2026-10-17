import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated } from "react-native";

const RandomEmoji = () => {
  const [animation] = useState(new Animated.Value(0));
  const [visible, setVisible] = useState(false);
  const emojiFaces = ["🤩", "😍", "😄", "🥳", "😎", "😊", "🤗"];
  const randomFace = emojiFaces[Math.floor(Math.random() * emojiFaces.length)];

  const handlePress = () => {
    setVisible(true);
    Animated.timing(animation, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setTimeout(() => {
        setVisible(false);
        animation.setValue(0);
      }, 1000);
    });
  };

  const animatedStyle = {
    transform: [
      {
        translateY: animation.interpolate({
          inputRange: [0, 1],
          outputRange: [-200, 0],
        }),
      },
    ],
    opacity: animation,
  };

  return (
    <TouchableOpacity style={styles.container} onPress={handlePress}>
      <Text style={styles.emoji}>😎</Text>
      {visible && (
        <Animated.Text style={[styles.randomFace, animatedStyle]}>
          {randomFace}
        </Animated.Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  emoji: {
    fontSize: 24,
  },
  randomFace: {
    fontSize: 48,
    position: "absolute",
    top: 0,
  },
});

export default RandomEmoji;
