import { Box, Container } from "@chakra-ui/react";
import { RunView } from "./RunView";

export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Box as="main" minH="100dvh" bg="gray.50">
      <Container maxW="4xl" py={{ base: 8, md: 16 }}>
        <RunView id={id} />
      </Container>
    </Box>
  );
}
