import { query, orderByChild, equalTo, get, ref } from 'firebase/database';
import database from './firebaseConfig';

const fetchUserByEmail = async (email) => {
    console.log(email)
  const usersRef = ref(database, '/users');
  const emailQuery = query(usersRef, orderByChild('email'), equalTo(email));
  const snapshot = await get(emailQuery);
  let userId = null;
  if (snapshot.exists()) {
    snapshot.forEach((childSnapshot) => {
    userId = childSnapshot.key;  
    //   user = childSnapshot.val();
    });
  }
  console.log(userId);
  return userId;
};

const fetchGamesForUser = async (userId) => {
  const gamesRef = ref(database, '/games');
  const gamesQuery = query(gamesRef, orderByChild('player1').equalTo(userId).or(orderByChild('player2').equalTo(userId)));
  const snapshot = await get(gamesQuery);
  const games = [];
  if (snapshot.exists()) {
    snapshot.forEach((childSnapshot) => {
      const game = childSnapshot.val();
      games.push(game);
    });
  }
  console.log(games)
  return games;
};

const fetchGamesByEmail = async (email) => {
    const user = await fetchUserByEmail(email);
      if (user) {
        const userId = user.userId; // Assuming the user object has a userId property
        const games = await fetchGamesForUser(userId);
        console.log(games);
        return games
      } else {
        console.log('User not found');
      }
}


  export {fetchUserByEmail, fetchGamesForUser, fetchGamesByEmail}