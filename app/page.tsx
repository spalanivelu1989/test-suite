"use client";

import { Box, Container, Heading, VStack } from "@chakra-ui/react";
import { RunForm } from "./RunForm";
import { useThemeMode } from "./providers";
import { getCatppuccinColors } from "./theme/catppuccin";

export default function HomePage() {
  const { theme } = useThemeMode();
  const colors = getCatppuccinColors(theme);
  const isDark = theme === "dark";

  return (
    <Box
      as="main"
      minH="100dvh"
      bg={
        isDark
          ? `radial-gradient(circle at center, ${colors.surface0} 0%, ${colors.crust} 100%)`
          : `radial-gradient(circle at center, ${colors.base} 0%, ${colors.mantle} 100%)`
      }
      color={colors.text}
      position="relative"
      overflow="hidden"
      display="flex"
      alignItems="center"
      justifyContent="center"
      transition="background-color 0.3s ease, color 0.3s ease"
    >
      <Container maxW="3xl" position="relative" zIndex={1} mt={{ base: "-40px", md: "-80px" }}>
        <VStack align="stretch" gap={8}>
          <Heading
            fontSize={{ base: "3xl", md: "4xl" }}
            fontWeight="normal"
            letterSpacing="tight"
            textAlign="center"
            color={colors.text}
          >
            Test Suite AI Agent
          </Heading>

          <Box w="full" px={{ base: 4, md: 0 }}>
            <RunForm />
          </Box>
        </VStack>
      </Container>
    </Box>
  );
}
