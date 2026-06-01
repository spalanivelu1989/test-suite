"use client";

import React, { useState } from "react";
import {
  Box,
  Flex,
  HStack,
  Text,
  VStack,
  Link,
  Button,
  IconButton,
} from "@chakra-ui/react";
import {
  LayoutDashboard,
  Server,
  Sun,
  Moon,
  Workflow,
  Database,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useThemeMode } from "@/app/providers";
import { getAWSColors } from "@/app/theme/aws";

interface ConsoleLayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  runsCount: number;
  runningCount: number;
}

export function ConsoleLayout({
  children,
  activeTab,
  setActiveTab,
  runsCount,
  runningCount,
}: ConsoleLayoutProps) {
  const { theme, toggleTheme } = useThemeMode();
  const colors = getAWSColors(theme);
  const isDark = theme === "dark";
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Functional navigation items linked to app state
  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "test-runs", label: "Test Runs", icon: Server, badge: runningCount > 0 ? runningCount : undefined },
  ];



  return (
    <Box minH="100vh" bg={colors.bg} color={colors.text} display="flex" overflow="hidden">
      {/* Left Sidebar */}
      <Box
        w={sidebarOpen ? "260px" : "64px"}
        bg="#0d1630"
        borderRight="1px solid"
        borderColor="rgba(255, 255, 255, 0.08)"
        display="flex"
        flexDirection="column"
        flexShrink={0}
        overflowY="auto"
        transition="width 0.22s cubic-bezier(0.4, 0, 0.2, 1)"
        zIndex={100}
        h="100vh"
        position="sticky"
        top={0}
        className="glass-scroll-area"
      >
        {/* Sidebar Header: Logo, Title, and Action Controls */}
        <Flex
          h="52px"
          px={3.5}
          borderBottom="1px solid"
          borderColor="rgba(255, 255, 255, 0.08)"
          align="center"
          justify={sidebarOpen ? "space-between" : "center"}
          flexShrink={0}
        >
          {sidebarOpen ? (
            <>
              <HStack gap={2} overflow="hidden">
                <Box color="#38bdf8" flexShrink={0}>
                  <Workflow size={20} strokeWidth={2.5} />
                </Box>
                <Text fontWeight="extrabold" fontSize="14.5px" color="white" letterSpacing="0.3px">
                  Test Suite
                </Text>
              </HStack>

              <IconButton
                aria-label="Collapse Sidebar"
                variant="ghost"
                color="rgba(255, 255, 255, 0.65)"
                size="xs"
                h="26px"
                w="26px"
                cursor="pointer"
                borderRadius="md"
                border="1px solid rgba(255, 255, 255, 0.12)"
                bg="rgba(255, 255, 255, 0.03)"
                _hover={{
                  color: "white",
                  bg: "rgba(255, 255, 255, 0.15)",
                  borderColor: "#38bdf8",
                  boxShadow: "0 0 8px rgba(56, 189, 248, 0.3)"
                }}
                transition="all 0.2s ease"
                onClick={() => setSidebarOpen(false)}
                title="Collapse Sidebar"
              >
                <ChevronLeft size={16} strokeWidth={2.5} />
              </IconButton>
            </>
          ) : (
            <IconButton
              aria-label="Expand Sidebar"
              variant="ghost"
              color="rgba(255, 255, 255, 0.65)"
              size="xs"
              h="32px"
              w="32px"
              cursor="pointer"
              borderRadius="md"
              border="1px solid rgba(255, 255, 255, 0.12)"
              bg="rgba(255, 255, 255, 0.03)"
              _hover={{
                color: "white",
                bg: "rgba(255, 255, 255, 0.15)",
                borderColor: "#38bdf8",
                boxShadow: "0 0 10px rgba(56, 189, 248, 0.4)"
              }}
              transition="all 0.2s ease"
              onClick={() => setSidebarOpen(true)}
              title="Expand Sidebar"
            >
              <ChevronRight size={16} strokeWidth={2.5} />
            </IconButton>
          )}
        </Flex>

        {/* User profile details block */}
        {sidebarOpen ? (
          <HStack
            gap={3}
            px={4}
            py={3.5}
            borderBottom="1px solid"
            borderColor="rgba(255, 255, 255, 0.08)"
            bg="rgba(0, 0, 0, 0.15)"
            flexShrink={0}
          >
            <Box
              w="36px"
              h="36px"
              borderRadius="xl"
              bg="#1d3557"
              color="white"
              display="flex"
              alignItems="center"
              justifyContent="center"
              fontWeight="extrabold"
              fontSize="14px"
              boxShadow="0 2px 8px rgba(29, 53, 87, 0.4)"
              flexShrink={0}
            >
              T
            </Box>
            <VStack align="flex-start" gap={0} overflow="hidden">
              <Text color="white" fontSize="12.5px" fontWeight="bold" truncate maxW="160px">
                root@local
              </Text>
              <HStack gap={1} color="rgba(255, 255, 255, 0.5)" align="center">
                <Database size={11} />
                <Text fontSize="10.5px" fontWeight="medium">Super Admin</Text>
              </HStack>
            </VStack>
          </HStack>
        ) : (
          <Flex justify="center" py={3.5} borderBottom="1px solid" borderColor="rgba(255, 255, 255, 0.08)" flexShrink={0}>
            <Box
              w="30px"
              h="30px"
              borderRadius="xl"
              bg="#1d3557"
              color="white"
              display="flex"
              alignItems="center"
              justifyContent="center"
              fontWeight="extrabold"
              fontSize="12px"
              boxShadow="0 2px 8px rgba(29, 53, 87, 0.4)"
            >
              T
            </Box>
          </Flex>
        )}

        {/* Primary Functional Navigation Buttons */}
        <VStack align="stretch" gap={0.5} px={sidebarOpen ? 2 : 1} py={3} flexShrink={0}>
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            const Icon = item.icon;
            return (
              <Button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                variant="ghost"
                justifyContent={sidebarOpen ? "flex-start" : "center"}
                px={sidebarOpen ? 3.5 : 0}
                py={2.5}
                height="34px"
                borderRadius="lg"
                bg={isActive ? "rgba(56, 189, 248, 0.12)" : "transparent"}
                border={isActive ? "1.5px solid rgba(56, 189, 248, 0.45)" : "1.5px solid transparent"}
                color={isActive ? "white" : "rgba(255, 255, 255, 0.65)"}
                fontWeight={isActive ? "semibold" : "normal"}
                fontSize="13px"
                cursor="pointer"
                _hover={{
                  bg: isActive ? "rgba(56, 189, 248, 0.18)" : "rgba(255, 255, 255, 0.05)",
                  color: "white",
                }}
              >
                <HStack gap={3.5} justify={sidebarOpen ? "flex-start" : "center"} w="full" overflow="hidden">
                  <Box color={isActive ? "#38bdf8" : "inherit"} flexShrink={0}>
                    <Icon size={15} />
                  </Box>
                  {sidebarOpen && <Text truncate>{item.label}</Text>}
                </HStack>
              </Button>
            );
          })}
        </VStack>

        {/* Sidebar Footer with Theme Toggle */}
        <Box mt="auto" p={sidebarOpen ? 3 : 2} borderTop="1px solid" borderColor="rgba(255, 255, 255, 0.08)">
          <Flex align="center" justify={sidebarOpen ? "space-between" : "center"} gap={2}>
            {sidebarOpen && (
              <Text fontSize="11px" color="rgba(255, 255, 255, 0.4)" fontWeight="medium">
                Test Suite v1.0.0
              </Text>
            )}
            <IconButton
              aria-label="Toggle Theme"
              variant="ghost"
              color="rgba(255, 255, 255, 0.65)"
              size="xs"
              h="28px"
              w={sidebarOpen ? "28px" : "32px"}
              cursor="pointer"
              borderRadius="md"
              _hover={{ color: "white", bg: "rgba(255, 255, 255, 0.1)" }}
              onClick={toggleTheme}
              title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {isDark ? <Sun size={14} /> : <Moon size={14} />}
            </IconButton>
          </Flex>
        </Box>
      </Box>

      {/* Main Content Area */}
      <Box display="flex" flexDirection="column" flex={1} overflow="hidden" h="100vh">
        {/* Breadcrumb Bar */}
        <Flex
          h="36px"
          bg={isDark ? "rgba(17, 24, 39, 0.4)" : "rgba(248, 250, 252, 0.4)"}
          borderBottom="1px solid"
          borderColor={colors.border}
          align="center"
          px={4}
          fontSize="11.5px"
          color={colors.subtext}
          gap={2}
          backdropFilter="blur(8px)"
          flexShrink={0}
        >
          <Text cursor="pointer" _hover={{ textDecoration: "underline" }} onClick={() => setActiveTab("dashboard")}>
            SUITE
          </Text>
          <Text>/</Text>
          <Text fontWeight="semibold" color={colors.text}>
            {activeTab === "dashboard" && "Dashboard"}
            {activeTab === "test-runs" && "Test Runs"}
            {activeTab === "security-groups" && "Security Groups"}
            {activeTab === "key-pairs" && "Key Pairs (API Keys)"}
          </Text>
        </Flex>

        {/* Scrollable Main Content */}
        <Box flex={1} overflowY="auto" p={6}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
