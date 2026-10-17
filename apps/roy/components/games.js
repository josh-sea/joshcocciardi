import React, { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  Platform,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import CreateGameForm from "./newgame";
import GameCard from "./GameCard";
import { useGames } from "../hooks/useGames";
import HamburgerMenu from "./HamburgerMenu";
import useFeatureFlags from "../hooks/useFeatureFlags";
import UpgradeModal from "./UpgradeModal";

const { height, width } = Dimensions.get("window");
const isSmallScreen = height < 667;
const MAX_FREE_GAMES = 3;

const Games = ({ route }) => {
  const navigation = useNavigation();
  const { userId } = route.params;
  const [showCreateGameForm, setShowCreateGameForm] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Use our custom hook for games and notifications
  const { games, activeGameCount } = useGames(userId);
  const { unlimitedGames, deathmatch, strategist } = useFeatureFlags(userId);
  const canCreateGame = unlimitedGames || activeGameCount < MAX_FREE_GAMES;

  const handleCreateGameButtonPress = () => {
    if (!canCreateGame) {
      setShowUpgradeModal(true);
      return;
    }
    setShowCreateGameForm(!showCreateGameForm);
  };

  const handleCreateGameFormClose = () => {
    setShowCreateGameForm(false);
  };

  const handleSolo = () => {
    navigation.navigate("Solo");
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[
            styles.title,
            isSmallScreen && styles.titleSmall
          ]}>My Games</Text>
          {!unlimitedGames && (
            <Text style={styles.gameCount}>
              {activeGameCount}/{MAX_FREE_GAMES}
            </Text>
          )}
          <View style={styles.menuContainer}>
            <HamburgerMenu onNewGame={handleCreateGameButtonPress} userId={userId} />
          </View>
        </View>
        
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={[
            styles.scrollContent,
            isSmallScreen && styles.scrollContentSmall
          ]}
          showsVerticalScrollIndicator={false}
        >
          {games.map((game) => (
            <GameCard
              key={game.gameId}
              game={game}
              userId={userId}
            />
          ))}
        </ScrollView>

        <View style={[
          styles.bottomContainer,
          isSmallScreen && styles.bottomContainerSmall
        ]}>
          <TouchableOpacity
            style={[
              styles.soloButton,
              isSmallScreen && styles.soloButtonSmall
            ]}
            onPress={handleSolo}
          >
            <Text style={[
              styles.buttonText,
              isSmallScreen && styles.buttonTextSmall
            ]}>Play Solo</Text>
          </TouchableOpacity>
        </View>

        {showCreateGameForm && (
          <View style={styles.createGameFormWrapper}>
            <CreateGameForm
              userId={userId}
              onClose={handleCreateGameFormClose}
              deathmatch={deathmatch}
              strategist={strategist}
            />
          </View>
        )}

        {showUpgradeModal && (
          <UpgradeModal onClose={() => setShowUpgradeModal(false)} />
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  container: {
    flex: 1,
    padding: isSmallScreen ? 8 : 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: isSmallScreen ? 10 : 20,
    paddingTop: isSmallScreen ? 10 : 20,
    height: isSmallScreen ? 40 : 60,
    position: 'relative',
  },
  menuContainer: {
    position: 'absolute',
    right: 0,
    top: isSmallScreen ? 10 : 20,
  },
  scrollContainer: {
    flex: 1,
    marginTop: isSmallScreen ? 10 : 20,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingBottom: 20,
  },
  scrollContentSmall: {
    paddingBottom: 10,
  },
  bottomContainer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  bottomContainerSmall: {
    paddingVertical: 8,
  },
  soloButton: {
    width: width * 0.85,
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "darkgreen",
    borderRadius: 15,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  soloButtonSmall: {
    height: 40,
    width: width * 0.8,
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    fontFamily: "PressStart2P-Regular",
  },
  buttonTextSmall: {
    fontSize: 12,
  },
  createGameFormWrapper: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: 'center',
    fontFamily: "PressStart2P-Regular",
  },
  titleSmall: {
    fontSize: 18,
  },
  gameCount: {
    position: 'absolute',
    left: 0,
    top: isSmallScreen ? 15 : 28,
    fontSize: isSmallScreen ? 10 : 12,
    fontFamily: "PressStart2P-Regular",
    color: "#888",
  },
});

export default Games;
