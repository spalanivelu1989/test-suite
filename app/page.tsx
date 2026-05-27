"use client";

import { Box, Container, Heading, VStack } from "@chakra-ui/react";
import { RunForm } from "./RunForm";
import { useThemeMode } from "./providers";

export default function HomePage() {
  const { theme } = useThemeMode();
  const isDark = theme === "dark";

  return (
    <Box
      as="main"
      minH="100dvh"
      bg={
        isDark
          ? "radial-gradient(circle at center, #0e1b35 0%, #030712 100%)"
          : "radial-gradient(circle at center, #f8fafc 0%, #e2e8f0 100%)"
      }
      color={isDark ? "white" : "slate.900"}
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
            color={isDark ? "white" : "gray.850"}
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
