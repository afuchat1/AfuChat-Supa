import React, { useEffect, useState } from "react";
import {
  Dimensions,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  images: string[];
  initialIndex?: number;
  visible: boolean;
  onClose: () => void;
};

export function ImageViewer({ images, initialIndex = 0, visible, onClose }: Props) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const { width, height } = Dimensions.get("window");

  useEffect(() => {
    if (visible) {
      setCurrentIndex(Math.min(initialIndex, Math.max(0, images.length - 1)));
    }
  }, [visible, initialIndex, images]);

  if (!visible || images.length === 0) return null;

  const hasMultiple = images.length > 1;

  return (
    <Modal transparent visible={visible} animationType="fade" statusBarTranslucent>
      <View style={styles.container}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {hasMultiple && (
            <Text style={styles.counter}>
              {currentIndex + 1} / {images.length}
            </Text>
          )}
        </View>

        <View style={styles.imageContainer}>
          {hasMultiple && currentIndex > 0 && (
            <TouchableOpacity
              style={[styles.navBtn, styles.navLeft]}
              onPress={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            >
              <Ionicons name="chevron-back" size={32} color="#fff" />
            </TouchableOpacity>
          )}

          <Image
            source={{ uri: images[currentIndex] }}
            style={[styles.image, { maxWidth: width - 80, maxHeight: height - 160 }]}
            resizeMode="contain"
          />

          {hasMultiple && currentIndex < images.length - 1 && (
            <TouchableOpacity
              style={[styles.navBtn, styles.navRight]}
              onPress={() => setCurrentIndex((i) => Math.min(images.length - 1, i + 1))}
            >
              <Ionicons name="chevron-forward" size={32} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        {hasMultiple && (
          <View style={styles.dots}>
            {images.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === currentIndex && styles.dotActive]}
              />
            ))}
          </View>
        )}
      </View>
    </Modal>
  );
}

export function useImageViewer() {
  const [state, setState] = useState<{ visible: boolean; images: string[]; index: number }>({
    visible: false,
    images: [],
    index: 0,
  });

  const openViewer = (images: string[], index = 0) => {
    setState({ visible: true, images, index });
  };

  const closeViewer = () => {
    setState((s) => ({ ...s, visible: false }));
  };

  return { ...state, openViewer, closeViewer };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Platform.OS === "web" ? 16 : 50,
    paddingHorizontal: 16,
    zIndex: 10,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  counter: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  imageContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  navBtn: {
    position: "absolute",
    top: "50%",
    zIndex: 10,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginTop: -24,
  },
  navLeft: {
    left: 16,
  },
  navRight: {
    right: 16,
  },
  dots: {
    position: "absolute",
    bottom: 32,
    flexDirection: "row",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  dotActive: {
    backgroundColor: "#fff",
  },
});
