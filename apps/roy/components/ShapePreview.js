import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { getShapePreviewCells, SHAPE_INFO } from "../utils/gameEngine";

// Renders a small 5x5 grid preview of a shape's pattern.
// Shows which cells get player color vs red vs center (where you click).
const ShapePreview = ({ shapeName, label, size = "small" }) => {
  const cells = getShapePreviewCells(shapeName);
  const info = SHAPE_INFO[shapeName];
  const cellSize = size === "large" ? 16 : 10;
  const cellMargin = 1;

  const getCellStyle = (type) => {
    switch (type) {
      case "center":
        return { backgroundColor: "#333" };
      case "player":
        return { backgroundColor: "yellow" };
      case "red":
        return { backgroundColor: "red" };
      default:
        return { backgroundColor: "#e8e8e8" };
    }
  };

  return (
    <View style={styles.container}>
      {label && <Text style={[styles.label, size === "large" && styles.labelLarge]}>{label}</Text>}
      <View style={styles.grid}>
        {[0, 1, 2, 3, 4].map((row) => (
          <View key={row} style={styles.row}>
            {cells
              .filter((c) => c.row === row)
              .map((cell) => (
                <View
                  key={`${cell.row}-${cell.col}`}
                  style={[
                    {
                      width: cellSize,
                      height: cellSize,
                      margin: cellMargin,
                      borderRadius: 2,
                    },
                    getCellStyle(cell.type),
                  ]}
                />
              ))}
          </View>
        ))}
      </View>
      {size === "large" && <Text style={styles.shapeName}>{info.name}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  label: {
    fontSize: 7,
    fontFamily: "PressStart2P-Regular",
    color: "#888",
    marginBottom: 3,
  },
  labelLarge: {
    fontSize: 8,
    marginBottom: 4,
  },
  grid: {
    // rows are stacked vertically
  },
  row: {
    flexDirection: "row",
  },
  shapeName: {
    fontSize: 7,
    fontFamily: "PressStart2P-Regular",
    color: "#555",
    marginTop: 3,
  },
});

export default ShapePreview;
