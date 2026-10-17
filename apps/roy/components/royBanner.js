import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated } from "react-native";

const Banner = () => {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const shakeAnimation = Animated.sequence([
      Animated.timing(animatedValue, {
        toValue: -9,
        duration: 600,
        useNativeDriver: false,
      }),
      Animated.timing(animatedValue, {
        toValue: -6,
        duration: 200,
        useNativeDriver: false,
      }),
      Animated.timing(animatedValue, {
        toValue: -3,
        duration: 200,
        useNativeDriver: false,
      }),
      Animated.timing(animatedValue, {
        toValue: 3,
        duration: 400,
        useNativeDriver: false,
      }),
      Animated.timing(animatedValue, {
        toValue: 6,
        duration: 200,
        useNativeDriver: false,
      }),
      Animated.timing(animatedValue, {
        toValue: 9,
        duration: 200,
        useNativeDriver: false,
      }),
    ]);

    Animated.loop(shakeAnimation).start();
  }, []);

  const interpolateColor = animatedValue.interpolate({
    inputRange: [-9, -6, -3, 3, 6, 9],
    outputRange: ["#FF0000", "#FF8C00", "#FFFF00", "#00FF00", "#0000FF", "#8A2BE2"],
  });

  return (
    <View style={styles.container}>
      <Animated.Text
        style={[
          styles.text,
          {
            transform: [{ translateX: animatedValue }],
            color: interpolateColor,
            textShadowColor: "rgba(0, 0, 0, 0.75)",
            textShadowOffset: { width: 1, height: 1 },
            textShadowRadius: 2,
          },
        ]}
      >
        Color Chasers
      </Animated.Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 30,
  },
  text: {
    fontSize: 42,
    textAlign: "center",
    fontWeight: "bold",
    fontFamily: "PressStart2P-Regular", // Use a custom 8-bit style font if available
  },
});

export default Banner;
