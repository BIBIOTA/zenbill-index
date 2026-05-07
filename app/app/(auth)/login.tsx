import { useState, useRef } from 'react'
import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { getApiClient, ApiError } from '@zenbill/shared'
import type { ApiResponse, User } from '@zenbill/shared'
import { useAuthStore } from '../../lib/auth'
import { Colors, Spacing } from '../../constants/theme'

type Stage = 'email' | 'code' | 'verifying'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [stage, setStage] = useState<Stage>('email')
  const [loading, setLoading] = useState(false)
  const codeInputRef = useRef<TextInput>(null)

  const handleSendCode = async () => {
    if (!email.trim()) return
    setLoading(true)
    try {
      const api = getApiClient()
      const res = await api.post<ApiResponse<{ token: string; refresh_token?: string }>>('/auth/login', {
        email: email.trim(),
        method: 'code',
      })

      // Dev mode: backend returns token directly
      if (res.data?.token) {
        useAuthStore.getState().setAuth(res.data.token, res.data.refresh_token || '', { id: '', email: email.trim() })
        try {
          const meRes = await api.get<ApiResponse<User>>('/auth/me')
          if (meRes.data) {
            useAuthStore.getState().setUser(meRes.data)
          }
        } catch {}
        router.replace('/(tabs)')
        return
      }

      setStage('code')
      setTimeout(() => codeInputRef.current?.focus(), 300)
    } catch (err) {
      Alert.alert('錯誤', err instanceof Error ? err.message : '登入失敗')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCode = async () => {
    if (code.length !== 6) return
    setStage('verifying')
    try {
      const api = getApiClient()
      const res = await api.post<ApiResponse<{ token: string; refresh_token?: string }>>('/auth/verify', {
        email: email.trim(),
        code,
      })

      if (!res.data?.token) {
        Alert.alert('錯誤', '驗證失敗，請重試')
        setStage('code')
        return
      }

      useAuthStore.getState().setAuth(res.data.token, res.data.refresh_token || '', { id: '', email: email.trim() })
      try {
        const meRes = await api.get<ApiResponse<User>>('/auth/me')
        if (meRes.data) {
          useAuthStore.getState().setUser(meRes.data)
        }
      } catch {}
      router.replace('/(tabs)')
    } catch (err) {
      Alert.alert('錯誤', err instanceof ApiError ? err.message : '驗證碼錯誤或已過期')
      setStage('code')
      setCode('')
    }
  }

  // Stage: verifying
  if (stage === 'verifying') {
    return (
      <SafeAreaView style={styles.flex1}>
        <View style={styles.container}>
          <Text style={styles.titleLarge}>登入中...</Text>
        </View>
      </SafeAreaView>
    )
  }

  // Stage: enter verification code
  if (stage === 'code') {
    return (
      <SafeAreaView style={styles.flex1}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.flex1}
        >
          <View style={styles.container}>
            <Text style={styles.titleLarge}>請查看信箱</Text>
            <Text style={styles.subtextCenter}>
              驗證碼已寄至 {email}{'\n'}請輸入信件中的 6 位數驗證碼
            </Text>
            <TextInput
              ref={codeInputRef}
              style={[styles.input, styles.codeInput]}
              placeholder="000000"
              placeholderTextColor={Colors.textSecondary}
              keyboardType="number-pad"
              maxLength={6}
              value={code}
              onChangeText={(text) => {
                setCode(text)
                if (text.length === 6) {
                  setTimeout(() => handleVerifyCode(), 100)
                }
              }}
              testID="login_code_input"
            />
            <TouchableOpacity
              style={[styles.primaryButton, code.length !== 6 && styles.primaryButtonDisabled]}
              onPress={handleVerifyCode}
              disabled={code.length !== 6}
              testID="login_verify_button"
            >
              <Text style={styles.primaryButtonText}>驗證</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => { setStage('email'); setCode('') }}
              testID="login_change_email_link"
            >
              <Text style={styles.linkText}>使用其他 Email</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  // Stage: enter email
  return (
    <SafeAreaView style={styles.flex1}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex1}
      >
        <View style={styles.container}>
          <Text style={styles.appTitle}>ZenBill</Text>
          <Text style={styles.subtitle}>使用 Email 登入</Text>
          <TextInput
            style={styles.input}
            placeholder="你的電子信箱"
            placeholderTextColor={Colors.textSecondary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={setEmail}
            testID="login_email_input"
          />
          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
            onPress={handleSendCode}
            disabled={loading}
            testID="login_submit_button"
          >
            <Text style={styles.primaryButtonText}>
              {loading ? '發送中...' : '發送驗證碼'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.lg,
  },
  appTitle: {
    fontSize: 30,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  titleLarge: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 16,
    marginBottom: Spacing.xl,
  },
  subtextCenter: {
    color: Colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.text,
    marginBottom: Spacing.md,
    backgroundColor: Colors.background,
  },
  codeInput: {
    textAlign: 'center',
    fontSize: 24,
    letterSpacing: 8,
    fontWeight: '600',
  },
  primaryButton: {
    width: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 16,
  },
  linkButton: {
    marginTop: Spacing.xl,
  },
  linkText: {
    color: Colors.primary,
    fontSize: 16,
  },
})
