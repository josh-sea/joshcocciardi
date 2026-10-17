import React, { useContext, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import alert from "../utils/alert";
import { auth } from "./firebaseConfig";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { get, update } from "firebase/database";
import { royRef } from "./firebaseConfig";
import { UserContext, canUseGoogle, signInWithGoogle, googleErrorMessage } from "./session";
import { Ionicons } from "@expo/vector-icons";
import Banner from "../components/royBanner";

const Signup = () => {
  const { width } = Dimensions.get("window");
  // Already signed in (Google, or a login from another app on the site) but
  // no Roy profile yet: only the username is needed.
  const signedInUser = useContext(UserContext);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [hidePass, setHidePass] = useState(true);

  // Roy shares the josh-cocciardi user pool with the other apps, so someone
  // may already have an account from elsewhere. In that case sign them in
  // with the same password and just add their Roy profile.
  const signInOrCreate = async () => {
    try {
      return await createUserWithEmailAndPassword(auth, email, password);
    } catch (error) {
      if (error.code !== "auth/email-already-in-use") throw error;
      return signInWithEmailAndPassword(auth, email, password);
    }
  };

  const handleSignup = async () => {
    if (username.length < 1 || username.length > 16) {
      alert("Invalid Username", "Username must be 1 to 16 characters.");
      return;
    }

    try {
      const user = signedInUser || (await signInOrCreate()).user;
      const userId = user.uid;
      const existing = await get(royRef(`/users/${userId}/username`));
      if (!existing.exists()) {
        const friendCode = Math.floor(10000000 + Math.random() * 90000000).toString();
        // update() rather than set(): the rules grant each profile field on
        // its own and keep /features server-only.
        await update(royRef(`/users/${userId}`), {
          username,
          email: user.email,
          friendCode,
        });
      }
      // The session listener in App moves on to the games once the profile exists.
    } catch (error) {
      const message = error.code === "auth/invalid-credential" || error.code === "auth/wrong-password"
        ? canUseGoogle
          ? "That email already has an account. Use its password, or Continue with Google if that's how you signed up."
          : "That email already has an account. Use its existing password."
        : error.message;
      alert("Signup Failed", message);
    }
  };

  const handleGoogle = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      const message = googleErrorMessage(error);
      if (message) alert("Signup Failed", message);
    }
  };

  return (
    <View style={styles.container}>
      <Banner />
      {signedInUser && (
        <Text style={styles.note}>Pick a username to start playing as {signedInUser.email}</Text>
      )}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Username"
          autoCorrect={false}
          autoCapitalize="none"
          value={username}
          onChangeText={(text) => setUsername(text)}
          onSubmitEditing={signedInUser ? handleSignup : undefined}
        />
      </View>
      {!signedInUser && (
        <>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              autoCorrect={false}
              autoCapitalize="none"
              placeholder="Email"
              value={email}
              onChangeText={(text) => setEmail(text)}
            />
          </View>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Password"
              secureTextEntry={hidePass}
              value={password}
              autoCorrect={false}
              autoCapitalize="none"
              onChangeText={(text) => setPassword(text)}
              onSubmitEditing={handleSignup}
            />
            <TouchableOpacity onPress={() => setHidePass(!hidePass)}>
              <Ionicons
                name={hidePass ? "eye-outline" : "eye-off-outline"}
                size={24}
                color="black"
              />
            </TouchableOpacity>
          </View>
        </>
      )}
      <TouchableOpacity
        style={[styles.button, { width: width * 0.5 }]}
        onPress={handleSignup}
      >
        <Text style={styles.buttonText}>{signedInUser ? "Play" : "Signup"}</Text>
      </TouchableOpacity>
      {!signedInUser && canUseGoogle && (
        <TouchableOpacity
          style={[styles.button, styles.googleButton, { width: width * 0.5 }]}
          onPress={handleGoogle}
        >
          <Ionicons name="logo-google" size={16} color="darkgreen" />
          <Text style={[styles.buttonText, styles.googleButtonText]}>Google</Text>
        </TouchableOpacity>
      )}
      {signedInUser && (
        <TouchableOpacity onPress={() => signOut(auth)}>
          <Text style={styles.link}>Use a different account</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    height: 40,
    paddingHorizontal: 8,
    backgroundColor: "white",
    borderRadius: 15,
    width: "100%",
  },
  input: {
    flex: 1,
    height: "100%",
    backgroundColor: "white",
    paddingHorizontal: 8,
    fontFamily: "PressStart2P-Regular", // Use a custom 8-bit style font if available
  },
  button: {
    marginTop: 16,
    height: 40,
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "darkgreen",
    borderRadius: 15,
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    fontFamily: "PressStart2P-Regular", // Use a custom 8-bit style font if available
  },
  googleButton: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "white",
    borderWidth: 2,
    borderColor: "darkgreen",
  },
  googleButtonText: {
    color: "darkgreen",
  },
  note: {
    marginBottom: 16,
    textAlign: "center",
    fontSize: 10,
    lineHeight: 16,
    fontFamily: "PressStart2P-Regular",
  },
  link: {
    marginTop: 24,
    fontSize: 10,
    color: "darkgreen",
    textDecorationLine: "underline",
    fontFamily: "PressStart2P-Regular",
  },
});

export default Signup;
