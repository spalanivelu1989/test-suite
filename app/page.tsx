import { Box, Container, Heading, Text, VStack } from "@chakra-ui/react";
import { RunForm } from "./RunForm";

export default function HomePage() {
  return (
    <Box as="main" minH="100dvh" bg="gray.50">
      <Container maxW="3xl" py={{ base: 12, md: 24 }}>
        <VStack align="stretch" gap={6}>
          <Heading size="2xl">AI UI Testing Tool</Heading>
          <Text fontSize="lg" color="gray.600">
            Give it a web app URL. It crawls the site, generates Playwright
            tests with Claude, runs them, and hands back a report.
          </Text>
          <RunForm />
        </VStack>
      </Container>
    </Box>
  );
}
