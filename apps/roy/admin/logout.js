import React from "react";
import { TouchableOpacity, Text, StyleSheet, Dimensions } from "react-native";
import {auth} from "./firebaseConfig";
import { useNavigation } from "@react-navigation/native";

const { height, width } = Dimensions.get("window");
const isSmallScreen = height < 667; // iPhone SE and similar

const Logout = () => {
  const navigation = useNavigation();

  const handleLogout = () => {
    auth
      .signOut()
      .then(() => {
        // Handle successful logout
        console.log('Logged out successfully!');
        navigation.navigate('Login');
      })
      .catch((error) => {
        // Handle logout error
        Alert.alert('Logout Failed', error.message);
      });
  };

  return (
    <TouchableOpacity
      style={[styles.button, isSmallScreen && styles.buttonSmall]}
      onPress={handleLogout}
    >
      <Text style={[
        styles.buttonText,
        isSmallScreen && styles.buttonTextSmall,
        { width: isSmallScreen ? width * 0.2 : width * 0.25 }
      ]}>Logout</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: "lightgray",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  buttonSmall: {
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  buttonText: {
    color: "white",
    fontSize: 10,
    fontWeight: "bold",
    textAlign: "center",
    fontFamily: "PressStart2P-Regular",
  },
  buttonTextSmall: {
    fontSize: 8,
  },
});

export default Logout;
