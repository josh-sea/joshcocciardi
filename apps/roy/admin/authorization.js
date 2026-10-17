import React, { useState } from 'react';
import { View, TextInput, Button, Alert } from 'react-native';
import auth from './firebaseConfig';
import { signInWithEmailAndPassword } from "firebase/auth";
import { useNavigation } from '@react-navigation/native';

const navigation = useNavigation();

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  

  const handleLogin = () => {
    signInWithEmailAndPassword(auth, email, password).then((userCredential) => {
    const user = userCredential.user;
    navigation.navigate('Grid');
  })
  .catch((error) => {
    const errorCode = error.code;
    const errorMessage = error.message;
  });
  };

  return (
    <View>
      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={(text) => setEmail(text)}
      />
      <TextInput
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={(text) => setPassword(text)}
      />
      <Button title="Login" onPress={handleLogin} />
    </View>
  );
};

const Logout = () => {
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
    <View>
      <Button title="Logout" onPress={handleLogout} />
    </View>
  );
};

export { Logout };
