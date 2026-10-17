import React from "react";
import { TouchableOpacity, Text, StyleSheet, Dimensions } from "react-native";

const ResetButton = ({ handleReset }) => {
  const {width, height} = Dimensions.get("window");

  return (
    <TouchableOpacity onPress={handleReset} style={[styles.resetButton, {bottom: height < 677 ? 20 : 50 }]}>
      <Text style={[styles.resetButtonText, { width: width * 0.25 }]}>Reset</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  resetButton: {
    position: 'absolute',
    right: 20, 
    bottom: 30,
    backgroundColor: "darkgreen",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  resetButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "center",
    fontFamily: "PressStart2P-Regular", // Use a custom 8-bit style font if available
  },
});

export default ResetButton;
