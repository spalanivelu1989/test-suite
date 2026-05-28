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
  Menu,
} from "@chakra-ui/react";
import {
  MenuIcon,
  Search,
  Bell,
  HelpCircle,
  User,
  LayoutDashboard,
  Server,
  Layers,
  ShieldAlert,
  KeyRound,
  HardDrive,
  ExternalLink,
  Sun,
  Moon,
} from "lucide-react";
import { useThemeMode } from "@/app/providers";
import { getAWSColors, AWS_COLORS } from "@/app/theme/aws";
import NextLink from "next/link";

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

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "instances", label: "Instances", icon: Server, badge: runningCount > 0 ? runningCount : undefined },
    { id: "amis", label: "AMIs (Seeds)", icon: Layers },
    { id: "volumes", label: "Volumes (Specs)", icon: HardDrive },
    { id: "security-groups", label: "Security Groups", icon: ShieldAlert },
    { id: "key-pairs", label: "Key Pairs (API)", icon: KeyRound },
  ];

  return (
    <Box minH="100vh" bg={colors.bg} color={colors.text} display="flex" flexDirection="column">
      {/* 1. Global AWS Header */}
      <Flex
        as="header"
        h="48px"
        bg={AWS_COLORS.header.bg}
        color={AWS_COLORS.header.text}
        align="center"
        justify="space-between"
        px={4}
        borderBottom="1px solid"
        borderColor={AWS_COLORS.header.border}
        zIndex={100}
        position="sticky"
        top={0}
      >
        <HStack gap={4}>
          <IconButton
            aria-label="Toggle Navigation"
            variant="ghost"
            color="white"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            _hover={{ bg: "white/10" }}
          >
            <MenuIcon size={18} />
          </IconButton>

          {/* AWS Box Logo */}
          <Flex align="center" gap={2} cursor="pointer" onClick={() => setActiveTab("dashboard")}>
            <Box
              bg={AWS_COLORS.orange.light}
              color="black"
              fontWeight="black"
              fontSize="11px"
              px={1.5}
              py={0.5}
              borderRadius="sm"
              fontFamily="sans-serif"
              letterSpacing="tight"
            >
              TS
            </Box>
            <Text fontWeight="bold" fontSize="13px" letterSpacing="wide">
              Console
            </Text>
          </Flex>
        </HStack>

        {/* Global AWS search box */}
        <Flex
          align="center"
          bg={AWS_COLORS.header.searchBg}
          w="400px"
          maxW="40%"
          h="30px"
          borderRadius="md"
          px={3}
          gap={2}
          border="1px solid"
          borderColor="white/10"
        >
          <Search size={14} style={{ color: "rgba(255,255,255,0.6)" }} />
          <input
            type="text"
            placeholder="Search resources, services, and docs (Alt + S)"
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              color: "white",
              fontSize: "12px",
              width: "100%",
            }}
          />
        </Flex>

        {/* Header Right Actions */}
        <HStack gap={3}>
          <Button
            size="xs"
            onClick={toggleTheme}
            bg="transparent"
            border="none"
            color="white/80"
            _hover={{ color: "white", bg: "white/10" }}
            cursor="pointer"
            p={1.5}
            borderRadius="md"
            title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </Button>

          {/* Region Selector */}
          <Menu.Root>
            <Menu.Trigger asChild>
              <Button
                size="xs"
                variant="ghost"
                color="white/95"
                fontWeight="semibold"
                fontSize="11px"
                px={2.5}
                py={1.5}
                height="auto"
                _hover={{ bg: "white/10" }}
                cursor="pointer"
              >
                🌍 t-labs
              </Button>
            </Menu.Trigger>
          </Menu.Root>

          <IconButton
            aria-label="Notifications"
            variant="ghost"
            color="white/80"
            size="xs"
            _hover={{ bg: "white/10" }}
          >
            <Bell size={15} />
          </IconButton>

          <IconButton
            aria-label="Help"
            variant="ghost"
            color="white/80"
            size="xs"
            _hover={{ bg: "white/10" }}
          >
            <HelpCircle size={15} />
          </IconButton>

          <HStack gap={1} bg="white/10" px={2} py={1} borderRadius="md" cursor="pointer" _hover={{ bg: "white/15" }}>
            <User size={12} style={{ color: "white" }} />
            <Text fontSize="11px" fontWeight="medium" color="white">
              root@local
            </Text>
          </HStack>
        </HStack>
      </Flex>

      <Box display="flex" flex={1} overflow="hidden">
        {/* 2. Left Sidebar */}
        {sidebarOpen && (
          <Box
            w="240px"
            bg={colors.sidebarBg}
            borderRight="1px solid"
            borderColor={colors.border}
            display="flex"
            flexDirection="column"
            flexShrink={0}
            overflowY="auto"
          >
            <Box px={4} py={3} borderBottom="1px solid" borderColor={colors.border}>
              <Text fontSize="12px" fontWeight="extrabold" color={colors.text} letterSpacing="wider" textTransform="uppercase">
                Management
              </Text>
            </Box>

            <VStack align="stretch" gap={0} py={2}>
              {navItems.map((item) => {
                const isActive = activeTab === item.id;
                const Icon = item.icon;
                return (
                  <Button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    variant="ghost"
                    justifyContent="flex-start"
                    px={4}
                    py={2.5}
                    height="auto"
                    borderRadius={0}
                    borderLeft="3px solid"
                    borderLeftColor={isActive ? AWS_COLORS.orange.main : "transparent"}
                    bg={isActive ? colors.tabSelectedBg : "transparent"}
                    color={isActive ? colors.text : colors.subtext}
                    fontWeight={isActive ? "bold" : "normal"}
                    fontSize="12px"
                    cursor="pointer"
                    _hover={{
                      bg: colors.rowHover,
                      color: colors.text,
                    }}
                  >
                    <HStack justify="space-between" w="full">
                      <HStack gap={3}>
                        <Icon size={14} style={{ color: isActive ? AWS_COLORS.orange.main : "inherit" }} />
                        <span>{item.label}</span>
                      </HStack>
                      {item.badge !== undefined && (
                        <Box
                          bg={AWS_COLORS.orange.main}
                          color="white"
                          fontSize="9px"
                          fontWeight="bold"
                          px={1.5}
                          py={0.2}
                          borderRadius="full"
                        >
                          {item.badge}
                        </Box>
                      )}
                    </HStack>
                  </Button>
                );
              })}
            </VStack>

            <Box mt="auto" p={4} borderTop="1px solid" borderColor={colors.border}>
              <VStack align="stretch" gap={2}>
                <Link
                  href="https://playwright.dev"
                  target="_blank"
                  fontSize="10px"
                  color={colors.subtext}
                  _hover={{ color: AWS_COLORS.orange.main }}
                  display="flex"
                  alignItems="center"
                  gap={1}
                >
                  Playwright Documentation <ExternalLink size={8} />
                </Link>
                <Link
                  href="https://anthropic.com"
                  target="_blank"
                  fontSize="10px"
                  color={colors.subtext}
                  _hover={{ color: AWS_COLORS.orange.main }}
                  display="flex"
                  alignItems="center"
                  gap={1}
                >
                  Claude Agent SDK <ExternalLink size={8} />
                </Link>
              </VStack>
            </Box>
          </Box>
        )}

        {/* 3. Main Content Container */}
        <Box display="flex" flexDirection="column" flex={1} overflow="hidden">
          {/* Breadcrumb Bar */}
          <Flex
            h="36px"
            bg={isDark ? "#111827" : "#f8fafc"}
            borderBottom="1px solid"
            borderColor={colors.border}
            align="center"
            px={4}
            fontSize="11px"
            color={colors.subtext}
            gap={2}
          >
            <Text cursor="pointer" _hover={{ textDecoration: "underline" }} onClick={() => setActiveTab("dashboard")}>
              TS
            </Text>
            <Text>/</Text>
            <Text fontWeight="semibold" color={colors.text}>
              {activeTab === "dashboard" && "Dashboard"}
              {activeTab === "instances" && "Instances"}
              {activeTab === "amis" && "AMIs (Seeds)"}
              {activeTab === "volumes" && "Volumes (Generated Specs)"}
              {activeTab === "security-groups" && "Security Groups"}
              {activeTab === "key-pairs" && "Key Pairs (API Keys)"}
            </Text>
          </Flex>

          {/* Actual content placeholder */}
          <Box flex={1} overflowY="auto" p={6}>
            {children}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
